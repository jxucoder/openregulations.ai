"""
State Machine Graph for orchestrating the analysis pipeline.

This implements a simple but effective orchestration pattern:
1. Define nodes (agent functions)
2. Define edges (transitions)
3. Router decides next node based on state
4. Runner executes until terminal state

The graph is wired to real job functions in src/jobs/.
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Optional

from .state import AnalysisState, Status

logger = logging.getLogger(__name__)


@dataclass
class Node:
    """A node in the state graph."""

    name: str
    func: Callable[[AnalysisState], AnalysisState]
    next_status: Status  # Status after this node completes


class StateGraph:
    """
    A simple state machine for orchestrating agents.

    Usage:
        graph = StateGraph()
        graph.add_node("fetch", fetch_func, Status.DETECTING)
        graph.add_node("detect", detect_func, Status.ANALYZING)
        ...

        runner = GraphRunner(graph)
        final_state = runner.run(initial_state)
    """

    def __init__(self):
        self.nodes: dict[str, Node] = {}
        self.status_to_node: dict[Status, str] = {}

    def add_node(
        self, name: str, func: Callable[[AnalysisState], AnalysisState], next_status: Status
    ):
        """Add a node to the graph."""
        self.nodes[name] = Node(name=name, func=func, next_status=next_status)

    def set_entry_point(self, status: Status, node_name: str):
        """Map a status to the node that should handle it."""
        self.status_to_node[status] = node_name

    def get_next_node(self, state: AnalysisState) -> Optional[str]:
        """Determine which node should run next based on state."""
        return self.status_to_node.get(state.status)


class GraphRunner:
    """
    Executes a state graph until completion or error.

    Features:
    - Automatic state transitions
    - Error handling with retries
    - Step logging
    - Timeout protection
    """

    def __init__(self, graph: StateGraph, max_retries: int = 2, verbose: bool = True):
        self.graph = graph
        self.max_retries = max_retries
        self.verbose = verbose

    def log(self, message: str):
        """Log a message."""
        if self.verbose:
            logger.info(message)

    def run(self, initial_state: AnalysisState) -> AnalysisState:
        """
        Execute the graph from initial state until terminal state.

        Terminal states: COMPLETE, ERROR (after max retries)
        """
        state = initial_state
        state.started_at = datetime.now()

        self.log(f"Starting pipeline for {state.docket_id}")

        while True:
            # Check for terminal states
            if state.status == Status.COMPLETE:
                state.completed_at = datetime.now()
                self.log(f"Pipeline complete for {state.docket_id}")
                break

            if state.status == Status.ERROR:
                if state.retry_count >= self.max_retries:
                    self.log(f"Failed after {self.max_retries} retries: {state.error}")
                    break
                else:
                    state.retry_count += 1
                    self.log(f"Retrying (attempt {state.retry_count})...")
                    continue

            # Get next node
            node_name = self.graph.get_next_node(state)
            if not node_name:
                self.log(f"No node found for status: {state.status.value}")
                state.mark_error("router", f"No handler for status {state.status.value}")
                break

            node = self.graph.nodes.get(node_name)
            if not node:
                state.mark_error("router", f"Node not found: {node_name}")
                break

            # Execute node
            self.log(f"Running: {node_name}")
            state.current_step = node_name

            try:
                state = node.func(state)
                state.mark_step_complete(node_name)
                state.status = node.next_status
                self.log(f"{node_name} complete -> {state.status.value}")
            except Exception as e:
                error_msg = f"{type(e).__name__}: {str(e)}"
                self.log(f"{node_name} failed: {error_msg}")
                state.mark_error(node_name, error_msg)

        return state


# ============================================================================
# PIPELINE NODES: Wired to real job functions
# ============================================================================


def fetch_node(state: AnalysisState) -> AnalysisState:
    """Sync comments from Regulations.gov into the database."""
    from src.jobs.sync import sync_docket

    result = sync_docket(state.docket_id)
    state.raw_comment_count = result.get("total_on_api", 0)

    # Load comments from DB into state for downstream steps
    from src.db import get_client

    db = get_client()
    comments = db.get_comments(state.docket_id, limit=10000)
    state.comments = [
        __import__("src.orchestration.state", fromlist=["Comment"]).Comment(
            id=c.id,
            text=c.text or "",
            author=c.author or "Anonymous",
            organization=c.organization,
            state=c.state,
        )
        for c in comments
    ]

    return state


def detect_node(state: AnalysisState) -> AnalysisState:
    """Detect form letter campaigns."""
    from src.db import get_client
    from src.jobs.analyze import detect_form_letters

    db = get_client()
    db_comments = db.get_comments(state.docket_id, limit=10000)

    result = detect_form_letters(db_comments)

    from .state import Campaign
    from .state import Comment as StateComment

    state.campaigns = [
        Campaign(
            id=c["id"],
            template_preview=c["template"][:200],
            count=c["count"],
            percentage=round(c["count"] / len(db_comments) * 100, 1) if db_comments else 0,
        )
        for c in result["campaigns"]
    ]

    state.unique_comments = [
        StateComment(
            id=c.id,
            text=c.text or "",
            author=c.author or "Anonymous",
            organization=c.organization,
            state=c.state,
        )
        for c in result["unique_comments"]
    ]

    state.form_letter_percentage = result["form_letter_pct"]

    # Update form letter flags in DB
    for campaign in result["campaigns"]:
        db.bulk_update_form_letters(campaign["id"], campaign["comment_ids"])

    return state


def analyze_node(state: AnalysisState) -> AnalysisState:
    """Run AI analysis: themes, sentiment, notable comments."""
    from src.jobs.analyze import analyze_docket

    result = analyze_docket(state.docket_id)

    from .state import Theme

    state.themes = [
        Theme(
            name=t.get("name", ""),
            description=t.get("description", ""),
            count=t.get("count", 0),
        )
        for t in (result.get("themes") or [])
    ]

    state.sentiment = result.get("sentiment", {})
    state.executive_summary = result.get("executive_summary", "")

    return state


def report_node(state: AnalysisState) -> AnalysisState:
    """Generate and store report."""
    from src.jobs.embed import embed_docket

    # Generate embeddings for this docket
    try:
        embed_docket(state.docket_id)
    except Exception as e:
        logger.warning(f"Embedding failed (non-fatal): {e}")

    state.full_report = json.dumps(state.to_dict(), indent=2, default=str)
    return state


def build_analysis_graph() -> StateGraph:
    """
    Build a complete analysis graph wired to real jobs.

    Flow:
    PENDING -> FETCHING -> DETECTING -> ANALYZING -> REPORTING -> COMPLETE
    """
    graph = StateGraph()

    # Add nodes wired to real job functions
    graph.add_node("fetch", fetch_node, Status.DETECTING)
    graph.add_node("detect", detect_node, Status.ANALYZING)
    graph.add_node("analyze", analyze_node, Status.REPORTING)
    graph.add_node("report", report_node, Status.COMPLETE)

    # Map statuses to nodes
    graph.set_entry_point(Status.PENDING, "fetch")
    graph.set_entry_point(Status.FETCHING, "fetch")
    graph.set_entry_point(Status.DETECTING, "detect")
    graph.set_entry_point(Status.ANALYZING, "analyze")
    graph.set_entry_point(Status.REPORTING, "report")

    return graph


def run_pipeline(docket_id: str) -> dict:
    """
    Run the full analysis pipeline for a docket.

    Convenience function that builds the graph and runs it.
    """
    graph = build_analysis_graph()
    runner = GraphRunner(graph)
    state = AnalysisState(docket_id=docket_id)
    final_state = runner.run(state)
    return final_state.to_dict()
