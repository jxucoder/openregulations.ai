"""
Mirrulations client: read Regulations.gov data from the public S3 mirror.

Mirrulations (https://registry.opendata.aws/mirrulations/) mirrors Regulations.gov
into a public S3 bucket. Files are the raw API responses, so they parse with the
same `from_regulations_gov` model constructors as live API data.

No API key and no rate limit, which makes it the right source for bulk backfills.
The mirror lags the live API, so recent comments still need the regular sync.

Bucket layout:
    raw-data/<AGENCY>/<DOCKET>/text-<DOCKET>/docket/<DOCKET>.json
    raw-data/<AGENCY>/<DOCKET>/text-<DOCKET>/comments/<COMMENT_ID>.json

A file that changed upstream is stored again as `<ID>(1).json`, `<ID>(2).json`, ...
The highest number is the newest version.
"""

import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Iterator, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class MirrulationsClient:
    """Read-only client for the Mirrulations S3 bucket (anonymous HTTPS access)."""

    BUCKET_URL = "https://mirrulations.s3.amazonaws.com"
    S3_NAMESPACE = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
    TIMEOUT = 60
    MAX_WORKERS = 16

    # "<ID>.json" or "<ID>(<version>).json"
    _FILENAME_RE = re.compile(r"^(?P<id>.+?)(?:\((?P<version>\d+)\))?\.json$")

    def __init__(self, max_workers: int = MAX_WORKERS):
        self.max_workers = max_workers
        self.session = requests.Session()
        retry = Retry(
            total=4,
            backoff_factor=0.5,
            status_forcelist=[500, 502, 503, 504],
            allowed_methods=["GET"],
        )
        self.session.mount(
            "https://", HTTPAdapter(max_retries=retry, pool_maxsize=max_workers)
        )

    @staticmethod
    def _text_prefix(docket_id: str) -> str:
        """S3 prefix holding a docket's JSON files."""
        agency = docket_id.split("-")[0]
        return f"raw-data/{agency}/{docket_id}/text-{docket_id}/"

    def _list_keys(self, prefix: str) -> Iterator[str]:
        """Yield every object key under a prefix, following pagination."""
        token: Optional[str] = None
        while True:
            params = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
            if token:
                params["continuation-token"] = token

            response = self.session.get(
                f"{self.BUCKET_URL}/", params=params, timeout=self.TIMEOUT
            )
            response.raise_for_status()
            root = ET.fromstring(response.content)

            for key in root.iterfind("s3:Contents/s3:Key", self.S3_NAMESPACE):
                if key.text:
                    yield key.text

            token = root.findtext("s3:NextContinuationToken", namespaces=self.S3_NAMESPACE)
            if not token:
                break

    def _latest_versions(self, prefix: str) -> Dict[str, str]:
        """Map each record ID under a prefix to the key of its newest version."""
        latest: Dict[str, Tuple[int, str]] = {}
        for key in self._list_keys(prefix):
            match = self._FILENAME_RE.match(key.rsplit("/", 1)[-1])
            if not match:
                continue  # not a JSON record (e.g. *_content.html)
            record_id = match.group("id")
            version = int(match.group("version") or 0)
            if record_id not in latest or version > latest[record_id][0]:
                latest[record_id] = (version, key)
        return {record_id: key for record_id, (_, key) in latest.items()}

    def _get_data(self, key: str) -> Optional[dict]:
        """Fetch a mirrored API response and return its `data` object."""
        response = self.session.get(f"{self.BUCKET_URL}/{key}", timeout=self.TIMEOUT)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json().get("data")

    def get_docket(self, docket_id: str) -> Optional[dict]:
        """
        Get docket details in Regulations.gov API format.

        Args:
            docket_id: The Regulations.gov docket ID (e.g., NHTSA-2025-0491)

        Returns:
            The API `data` object, or None if the docket is not mirrored
        """
        keys = self._latest_versions(f"{self._text_prefix(docket_id)}docket/")
        key = keys.get(docket_id)
        return self._get_data(key) if key else None

    def list_comment_keys(self, docket_id: str) -> Dict[str, str]:
        """
        List the comments mirrored for a docket (fast, no content).

        Args:
            docket_id: The Regulations.gov docket ID

        Returns:
            Dict of comment ID -> S3 key of its newest version
        """
        return self._latest_versions(f"{self._text_prefix(docket_id)}comments/")

    def get_comments(self, keys: List[str]) -> Iterator[dict]:
        """
        Download comment details concurrently.

        Args:
            keys: S3 keys from `list_comment_keys`

        Yields:
            Comment `data` objects in Regulations.gov API format, in input order.
            Keys that no longer exist are skipped.
        """
        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            for data in pool.map(self._get_data, keys):
                if data:
                    yield data
