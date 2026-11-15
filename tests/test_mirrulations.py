"""Tests for the Mirrulations client and the Mirrulations backfill in the sync job."""

from typing import Dict, List, Optional, Set

import pytest

from src.db import Comment, Docket
from src.jobs import sync
from src.jobs.mirrulations import MirrulationsClient

DOCKET_ID = "NHTSA-2025-0491"
COMMENTS_PREFIX = f"raw-data/NHTSA/{DOCKET_ID}/text-{DOCKET_ID}/comments/"


def _list_page(keys: List[str], next_token: Optional[str] = None) -> bytes:
    contents = "".join(f"<Contents><Key>{k}</Key></Contents>" for k in keys)
    token = f"<NextContinuationToken>{next_token}</NextContinuationToken>" if next_token else ""
    return (
        '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">'
        f"{contents}{token}</ListBucketResult>"
    ).encode()


class FakeResponse:
    def __init__(self, content: bytes = b"", status_code: int = 200):
        self.content = content
        self.status_code = status_code

    def raise_for_status(self) -> None:
        assert self.status_code < 400


class FakeSession:
    """Serves S3 list pages keyed by continuation token."""

    def __init__(self, pages: Dict[Optional[str], bytes]):
        self.pages = pages
        self.requests: List[dict] = []

    def get(self, url: str, params: Optional[dict] = None, timeout: Optional[int] = None):
        self.requests.append(params or {})
        return FakeResponse(self.pages[(params or {}).get("continuation-token")])


def test_list_comment_keys_follows_pagination():
    client = MirrulationsClient()
    client.session = FakeSession({
        None: _list_page([f"{COMMENTS_PREFIX}{DOCKET_ID}-0002.json"], next_token="page2"),
        "page2": _list_page([f"{COMMENTS_PREFIX}{DOCKET_ID}-0003.json"]),
    })

    keys = client.list_comment_keys(DOCKET_ID)

    assert keys == {
        f"{DOCKET_ID}-0002": f"{COMMENTS_PREFIX}{DOCKET_ID}-0002.json",
        f"{DOCKET_ID}-0003": f"{COMMENTS_PREFIX}{DOCKET_ID}-0003.json",
    }
    assert client.session.requests[0]["prefix"] == COMMENTS_PREFIX


def test_newest_version_wins_and_non_json_is_ignored():
    client = MirrulationsClient()
    client.session = FakeSession({
        None: _list_page([
            f"{COMMENTS_PREFIX}{DOCKET_ID}-0002(10).json",
            f"{COMMENTS_PREFIX}{DOCKET_ID}-0002(2).json",
            f"{COMMENTS_PREFIX}{DOCKET_ID}-0002.json",
            f"{COMMENTS_PREFIX}{DOCKET_ID}-0002_content.html",
        ]),
    })

    assert client.list_comment_keys(DOCKET_ID) == {
        f"{DOCKET_ID}-0002": f"{COMMENTS_PREFIX}{DOCKET_ID}-0002(10).json",
    }


class FakeMirror:
    def __init__(self, comment_ids: List[str], has_docket: bool = True):
        self.comment_ids = comment_ids
        self.has_docket = has_docket
        self.fetched: List[str] = []

    def list_comment_keys(self, docket_id: str) -> Dict[str, str]:
        return {i: f"key/{i}.json" for i in self.comment_ids}

    def get_docket(self, docket_id: str) -> Optional[dict]:
        if not self.has_docket:
            return None
        return {"id": docket_id, "attributes": {"title": "Test docket", "agencyId": "NHTSA"}}

    def get_comments(self, keys: List[str]):
        for key in keys:
            comment_id = key.removeprefix("key/").removesuffix(".json")
            self.fetched.append(comment_id)
            yield {
                "id": comment_id,
                "attributes": {"comment": f"text of {comment_id}", "firstName": "A", "lastName": "B"},
            }


class FakeDB:
    def __init__(self, existing_ids: Optional[Set[str]] = None, has_docket: bool = False):
        self.comments: Dict[str, Comment] = {i: Comment(id=i, docket_id=DOCKET_ID) for i in existing_ids or set()}
        self.dockets: Dict[str, Docket] = {}
        if has_docket:
            self.dockets[DOCKET_ID] = Docket(id=DOCKET_ID, title="Live title", agency="NHTSA")
        self.batch_sizes: List[int] = []
        self.log: Dict[str, object] = {}

    def log_sync_start(self, job_type: str, docket_id: Optional[str] = None) -> int:
        self.log = {"job_type": job_type, "status": "started"}
        return 1

    def log_sync_complete(self, log_id: int, records_fetched: int = 0, records_created: int = 0) -> None:
        self.log.update(status="completed", fetched=records_fetched, created=records_created)

    def log_sync_error(self, log_id: int, error_message: str) -> None:
        self.log.update(status="failed", error=error_message)

    def get_docket(self, docket_id: str) -> Optional[Docket]:
        return self.dockets.get(docket_id)

    def upsert_docket(self, docket: Docket) -> None:
        self.dockets[docket.id] = docket

    def get_comment_ids(self, docket_id: str) -> Set[str]:
        return set(self.comments)

    def upsert_comments(self, comments: List[Comment]) -> int:
        self.batch_sizes.append(len(comments))
        self.comments.update({c.id: c for c in comments})
        return len(comments)


def _run(monkeypatch: pytest.MonkeyPatch, mirror: FakeMirror, db: FakeDB, **kwargs) -> dict:
    monkeypatch.setattr(sync, "MirrulationsClient", lambda: mirror)
    monkeypatch.setattr(sync, "get_client", lambda: db)
    return sync.backfill_docket_from_mirrulations(DOCKET_ID, **kwargs)


def _ids(n: int) -> List[str]:
    return [f"{DOCKET_ID}-{i:04d}" for i in range(1, n + 1)]


def test_backfill_fetches_only_missing_comments(monkeypatch):
    mirror = FakeMirror(_ids(5))
    db = FakeDB(existing_ids=set(_ids(2)), has_docket=True)

    result = _run(monkeypatch, mirror, db)

    assert mirror.fetched == _ids(5)[2:]
    assert set(db.comments) == set(_ids(5))
    assert db.comments[f"{DOCKET_ID}-0003"].text == f"text of {DOCKET_ID}-0003"
    assert result == {
        "docket_id": DOCKET_ID,
        "status": "synced",
        "total_in_mirror": 5,
        "in_database": 5,
        "newly_fetched": 3,
        "remaining": 0,
    }
    assert db.log == {"job_type": "mirrulations_backfill", "status": "completed", "fetched": 3, "created": 3}


def test_backfill_creates_missing_docket_but_keeps_existing_one(monkeypatch):
    db = FakeDB()
    _run(monkeypatch, FakeMirror(_ids(1)), db)
    assert db.dockets[DOCKET_ID].title == "Test docket"

    db = FakeDB(has_docket=True)
    _run(monkeypatch, FakeMirror(_ids(1)), db)
    assert db.dockets[DOCKET_ID].title == "Live title"


def test_backfill_respects_limit_and_batches_inserts(monkeypatch):
    monkeypatch.setattr(sync, "MIRRULATIONS_BATCH_SIZE", 2)
    db = FakeDB(has_docket=True)

    result = _run(monkeypatch, FakeMirror(_ids(7)), db, max_new_comments=5)

    assert db.batch_sizes == [2, 2, 1]
    assert result["newly_fetched"] == 5
    assert result["remaining"] == 2


def test_backfill_up_to_date_and_not_in_mirror(monkeypatch):
    db = FakeDB(existing_ids=set(_ids(3)), has_docket=True)
    assert _run(monkeypatch, FakeMirror(_ids(3)), db)["status"] == "up_to_date"
    assert db.batch_sizes == []

    db = FakeDB()
    assert _run(monkeypatch, FakeMirror([]), db)["status"] == "not_in_mirror"
    assert db.dockets == {}


def test_backfill_logs_failure_when_docket_file_is_missing(monkeypatch):
    db = FakeDB()
    with pytest.raises(ValueError, match="no docket file"):
        _run(monkeypatch, FakeMirror(_ids(1), has_docket=False), db)
    assert db.log["status"] == "failed"
    assert db.comments == {}
