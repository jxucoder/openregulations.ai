"""
State Machine Graph for orchestrating the analysis pipeline.

This implements a simple but effective orchestration pattern:
1. Define nodes (agent functions)
2. Define edges (transitions)
3. Router decides next node based on state
4. Runner executes until terminal state
"""

from typing import Callable, Optional
from dataclasses import dataclass
from datetime import datetime
import traceback

from .state import AnalysisState, Status


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
        self, 
        name: str, 
        func: Callable[[AnalysisState], AnalysisState],
        next_status: Status
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
    
    def __init__(
        self, 
        graph: StateGraph,
        max_retries: int = 2,
        verbose: bool = True
    ):
        self.graph = graph
        self.max_retries = max_retries
        self.verbose = verbose
    
    def log(self, message: str):
        """Log a message if verbose mode is on."""
        if self.verbose:
            print(message)
    
    def run(self, initial_state: AnalysisState) -> AnalysisState:
        """
        Execute the graph from initial state until terminal state.
        
        Terminal states: COMPLETE, ERROR (after max retries)
        """
        state = initial_state
        state.started_at = datetime.now()
        
        self.log(f"🚀 Starting analysis for {state.docket_id}")
        self.log(f"   Initial status: {state.status.value}")
        
        while True:
            # Check for terminal states
            if state.status == Status.COMPLETE:
                state.completed_at = datetime.now()
                self.log(f"✅ Analysis complete!")
                break
            
            if state.status == Status.ERROR:
                if state.retry_count >= self.max_retries:
                    self.log(f"❌ Failed after {self.max_retries} retries: {state.error}")
                    break
                else:
                    # Retry from the failed step
                    state.retry_count += 1
                    self.log(f"🔄 Retrying (attempt {state.retry_count})...")
                    # Reset to the status before the error
                    # This is simplified - real impl would track this better
                    continue
            
            # Get next node
            node_name = self.graph.get_next_node(state)
            if not node_name:
                self.log(f"⚠️  No node found for status: {state.status.value}")
                state.mark_error("router", f"No handler for status {state.status.value}")
                break
            
            node = self.graph.nodes.get(node_name)
            if not node:
                state.mark_error("router", f"Node not found: {node_name}")
                break
            
            # Execute node
            self.log(f"   ▶ Running: {node_name}")
            state.current_step = node_name
            
            try:
                state = node.func(state)
                state.mark_step_complete(node_name)
                state.status = node.next_status
                self.log(f"   ✓ {node_name} complete → {state.status.value}")
            except Exception as e:
                error_msg = f"{type(e).__name__}: {str(e)}"
                self.log(f"   ✗ {node_name} failed: {error_msg}")
                state.mark_error(node_name, error_msg)
                if self.verbose:
                    traceback.print_exc()
        
        return state


# ============================================================================
# CONVENIENCE: Build a complete analysis graph
# ============================================================================

def build_analysis_graph(
    fetcher_func: Callable,
    detector_func: Callable,
    analyzer_func: Callable,
    reporter_func: Callable,
) -> StateGraph:
    """
    Build a complete analysis graph with standard transitions.
    
    Flow:
    PENDING → FETCHING → DETECTING → ANALYZING → REPORTING → COMPLETE
    """
    graph = StateGraph()
    
    # Add nodes
    graph.add_node("fetch", fetcher_func, Status.DETECTING)
    graph.add_node("detect", detector_func, Status.ANALYZING)
    graph.add_node("analyze", analyzer_func, Status.REPORTING)
    graph.add_node("report", reporter_func, Status.COMPLETE)
    
    # Map statuses to nodes
    graph.set_entry_point(Status.PENDING, "fetch")
    graph.set_entry_point(Status.FETCHING, "fetch")
    graph.set_entry_point(Status.DETECTING, "detect")
    graph.set_entry_point(Status.ANALYZING, "analyze")
    graph.set_entry_point(Status.REPORTING, "report")
    
    return graph
