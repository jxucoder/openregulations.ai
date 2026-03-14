"""
Autonomous Agent System

Behavior is controlled by:
- config/agent.yaml  -> Agent settings, tools, safety
- prompts/*.md       -> Task instructions

To change behavior: edit the YAML/markdown files, not this code.
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import anthropic
import yaml

from src.db import get_client
from src.jobs.analyze import analyze_docket, run_analysis
from src.jobs.embed import embed_docket, run_embeddings
from src.jobs.report import generate_daily_report
from src.jobs.sync import run_sync, sync_docket

logger = logging.getLogger(__name__)


# ============================================================================
# CONFIG LOADING
# ============================================================================


@dataclass
class AgentConfig:
    """Loaded from config/agent.yaml"""

    name: str
    model: dict
    system_prompt: str
    tools: list[dict]
    safety: dict

    @classmethod
    def load(cls, config_path: str = None) -> "AgentConfig":
        if config_path is None:
            config_path = Path(__file__).parent / "config" / "agent.yaml"

        with open(config_path) as f:
            data = yaml.safe_load(f)

        return cls(
            name=data.get("name", "Agent"),
            model=data.get("model", {}),
            system_prompt=data.get("system_prompt", ""),
            tools=data.get("tools", []),
            safety=data.get("safety", {}),
        )


def load_prompt(task_name: str) -> str:
    """Load a prompt template from prompts/*.md"""
    prompt_path = Path(__file__).parent / "prompts" / f"{task_name}.md"

    if not prompt_path.exists():
        raise FileNotFoundError(f"Prompt not found: {prompt_path}")

    return prompt_path.read_text()


# ============================================================================
# TOOL DEFINITIONS (Claude format)
# ============================================================================

TOOL_DEFINITIONS = [
    {
        "name": "query_database",
        "description": "Query the Supabase database. Returns data from tables: dockets, comments, analyses, sync_log.",
        "input_schema": {
            "type": "object",
            "properties": {
                "table": {
                    "type": "string",
                    "description": "Table name (dockets, comments, analyses, sync_log)",
                },
                "select": {
                    "type": "string",
                    "description": "Columns to select (default: *)",
                    "default": "*",
                },
                "filters": {
                    "type": "object",
                    "description": 'Key-value filters to apply (e.g., {"docket_id": "NHTSA-2025-0491"})',
                },
                "order_by": {"type": "string", "description": "Column to order by"},
                "desc": {"type": "boolean", "description": "Order descending", "default": True},
                "limit": {"type": "integer", "description": "Max rows to return", "default": 25},
            },
            "required": ["table"],
        },
    },
    {
        "name": "sync_docket",
        "description": "Sync a docket from Regulations.gov API into the database. Fetches new comments only.",
        "input_schema": {
            "type": "object",
            "properties": {
                "docket_id": {"type": "string", "description": "Docket ID (e.g., NHTSA-2025-0491)"},
                "max_comments": {
                    "type": "integer",
                    "description": "Max new comments to fetch",
                    "default": 500,
                },
            },
            "required": ["docket_id"],
        },
    },
    {
        "name": "sync_active_dockets",
        "description": "Discover and sync all active dockets from Regulations.gov. Finds dockets with open comment periods and syncs them.",
        "input_schema": {
            "type": "object",
            "properties": {
                "max_dockets": {
                    "type": "integer",
                    "description": "Max dockets to sync",
                    "default": 10,
                },
                "max_comments_per_docket": {
                    "type": "integer",
                    "description": "Max comments per docket",
                    "default": 500,
                },
            },
        },
    },
    {
        "name": "analyze_docket",
        "description": "Run AI analysis on a docket: form letter detection, theme extraction, sentiment analysis, executive summary. Requires comments already synced.",
        "input_schema": {
            "type": "object",
            "properties": {
                "docket_id": {"type": "string", "description": "Docket ID to analyze"},
                "sample_size": {
                    "type": "integer",
                    "description": "Max unique comments to analyze",
                    "default": 200,
                },
            },
            "required": ["docket_id"],
        },
    },
    {
        "name": "analyze_pending_dockets",
        "description": "Find and analyze dockets that need analysis (never analyzed or have new comments since last analysis).",
        "input_schema": {
            "type": "object",
            "properties": {
                "max_dockets": {
                    "type": "integer",
                    "description": "Max dockets to analyze",
                    "default": 3,
                }
            },
        },
    },
    {
        "name": "embed_docket",
        "description": "Generate vector embeddings for a docket's comments (for semantic search). Skips form letters and already-embedded comments.",
        "input_schema": {
            "type": "object",
            "properties": {
                "docket_id": {"type": "string", "description": "Docket ID to embed"},
                "max_comments": {
                    "type": "integer",
                    "description": "Max comments to embed",
                    "default": 1000,
                },
            },
            "required": ["docket_id"],
        },
    },
    {
        "name": "embed_pending_dockets",
        "description": "Find and embed dockets that need embeddings.",
        "input_schema": {
            "type": "object",
            "properties": {
                "max_dockets": {
                    "type": "integer",
                    "description": "Max dockets to embed",
                    "default": 5,
                }
            },
        },
    },
    {
        "name": "generate_report",
        "description": "Generate a daily summary report of regulatory activity, trending dockets, and approaching deadlines.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_system_status",
        "description": "Get current system status: database stats, recent sync/analysis activity, and what needs attention.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "send_alert",
        "description": "Log an alert about important findings.",
        "input_schema": {
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "Alert message"},
                "severity": {"type": "string", "enum": ["info", "warning", "critical"]},
                "docket_id": {"type": "string", "description": "Related docket if any"},
            },
            "required": ["message"],
        },
    },
]


# ============================================================================
# TOOL IMPLEMENTATIONS (wired to real services)
# ============================================================================

ALLOWED_TABLES = {"dockets", "comments", "analyses", "sync_log", "comment_embeddings"}


class ToolExecutor:
    """Executes tools against real database and APIs."""

    def __init__(self, config: AgentConfig):
        self.config = config
        self.client = anthropic.Anthropic()
        self.alerts: list[dict] = []

    def execute(self, name: str, inputs: dict) -> Any:
        """Route tool call to implementation."""
        logger.info(f"Tool: {name}({json.dumps(inputs)[:200]})")

        handlers = {
            "query_database": self._query_database,
            "sync_docket": self._sync_docket,
            "sync_active_dockets": self._sync_active_dockets,
            "analyze_docket": self._analyze_docket,
            "analyze_pending_dockets": self._analyze_pending_dockets,
            "embed_docket": self._embed_docket,
            "embed_pending_dockets": self._embed_pending_dockets,
            "generate_report": self._generate_report,
            "get_system_status": self._get_system_status,
            "send_alert": self._send_alert,
        }

        handler = handlers.get(name)
        if not handler:
            return {"error": f"Unknown tool: {name}"}

        try:
            return handler(inputs)
        except Exception as e:
            logger.error(f"Tool {name} failed: {e}")
            return {"error": f"{type(e).__name__}: {str(e)}"}

    def _query_database(self, inputs: dict) -> Any:
        """Query Supabase tables with filters."""
        table = inputs["table"]
        if table not in ALLOWED_TABLES:
            return {"error": f"Table '{table}' not allowed. Use: {', '.join(ALLOWED_TABLES)}"}

        db = get_client()
        select = inputs.get("select", "*")
        query = db.client.table(table).select(select)

        # Apply filters
        filters = inputs.get("filters", {})
        for key, value in filters.items():
            query = query.eq(key, value)

        # Order
        order_by = inputs.get("order_by")
        if order_by:
            query = query.order(order_by, desc=inputs.get("desc", True))

        # Limit
        limit = min(inputs.get("limit", 25), 100)
        query = query.limit(limit)

        result = query.execute()
        return result.data or []

    def _sync_docket(self, inputs: dict) -> dict:
        """Sync a single docket from Regulations.gov."""
        return sync_docket(inputs["docket_id"], max_new_comments=inputs.get("max_comments", 500))

    def _sync_active_dockets(self, inputs: dict) -> list[dict]:
        """Discover and sync active dockets."""
        return run_sync(
            max_dockets=inputs.get("max_dockets", 10),
            max_comments_per_docket=inputs.get("max_comments_per_docket", 500),
        )

    def _analyze_docket(self, inputs: dict) -> dict:
        """Run full AI analysis on a docket."""
        return analyze_docket(inputs["docket_id"], sample_size=inputs.get("sample_size", 200))

    def _analyze_pending_dockets(self, inputs: dict) -> list[dict]:
        """Analyze dockets that need it."""
        return run_analysis(max_dockets=inputs.get("max_dockets", 3))

    def _embed_docket(self, inputs: dict) -> dict:
        """Generate embeddings for a docket."""
        return embed_docket(inputs["docket_id"], max_comments=inputs.get("max_comments", 1000))

    def _embed_pending_dockets(self, inputs: dict) -> list[dict]:
        """Embed dockets that need it."""
        return run_embeddings(max_dockets=inputs.get("max_dockets", 5))

    def _generate_report(self, inputs: dict) -> dict:
        """Generate daily report."""
        return generate_daily_report()

    def _get_system_status(self, inputs: dict) -> dict:
        """Get comprehensive system status."""
        db = get_client()

        # Database stats
        stats = db.get_stats()

        # Recent sync activity (last 24h)
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        recent_syncs = (
            db.client.table("sync_log")
            .select("job_type, status, docket_id, records_created, started_at")
            .gte("started_at", cutoff)
            .order("started_at", desc=True)
            .limit(20)
            .execute()
        )

        # Dockets needing sync (not synced in 24h)
        stale_dockets = (
            db.client.table("dockets")
            .select("id, title, last_synced_at, total_comments_at_sync")
            .or_(f"last_synced_at.is.null,last_synced_at.lt.{cutoff}")
            .limit(10)
            .execute()
        )

        # Dockets needing analysis
        analyses = db.client.table("analyses").select("docket_id, analyzed_at").execute()
        analyzed_ids = {a["docket_id"] for a in analyses.data}
        all_dockets = db.client.table("dockets").select("id, total_comments_at_sync").execute()
        unanalyzed = [
            d
            for d in all_dockets.data
            if d["id"] not in analyzed_ids and (d.get("total_comments_at_sync") or 0) > 0
        ]

        return {
            "database": stats,
            "recent_activity": recent_syncs.data[:10],
            "needs_sync": [d["id"] for d in stale_dockets.data],
            "needs_analysis": [d["id"] for d in unanalyzed[:10]],
            "alerts_this_session": self.alerts,
        }

    def _send_alert(self, inputs: dict) -> dict:
        """Log an alert."""
        alert = {
            "message": inputs["message"],
            "severity": inputs.get("severity", "info"),
            "docket_id": inputs.get("docket_id"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self.alerts.append(alert)
        logger.warning(f"ALERT [{alert['severity']}]: {alert['message']}")
        return {"logged": True, **alert}


# ============================================================================
# AUTONOMOUS AGENT
# ============================================================================


class AutonomousAgent:
    """
    The main agent. Behavior controlled by config + prompts.

    Usage:
        agent = AutonomousAgent()
        result = agent.run("analyze_docket", {"docket_id": "NHTSA-2025-0491"})
        result = agent.run("daily_scan")
        result = agent.run("full_pipeline")
    """

    def __init__(self, config_path: str = None):
        self.config = AgentConfig.load(config_path)
        self.client = anthropic.Anthropic()
        self.tools = ToolExecutor(self.config)

    def run(self, task: str, inputs: dict = None) -> dict:
        """
        Run a task.

        Args:
            task: Name of task (matches prompts/{task}.md) or raw instructions
            inputs: Variables to pass to the task
        """
        inputs = inputs or {}

        # Load task prompt
        try:
            task_prompt = load_prompt(task)
        except FileNotFoundError:
            task_prompt = task  # Allow raw task strings

        # Format with inputs
        for key, value in inputs.items():
            task_prompt = task_prompt.replace(f"{{{key}}}", str(value))

        logger.info(f"Starting task: {task} | Inputs: {inputs}")

        # Initialize conversation
        messages = [{"role": "user", "content": task_prompt}]
        iteration = 0
        max_iterations = self.config.safety.get("max_iterations", 15)

        # Agent loop
        while iteration < max_iterations:
            iteration += 1
            logger.info(f"Iteration {iteration}/{max_iterations}")

            # Call Claude
            response = self.client.messages.create(
                model=self.config.model.get("name", "claude-sonnet-4-20250514"),
                max_tokens=self.config.model.get("max_tokens", 4096),
                system=self.config.system_prompt,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            )

            # Check if done
            if response.stop_reason == "end_turn":
                final_text = ""
                for block in response.content:
                    if hasattr(block, "text"):
                        final_text += block.text

                logger.info(f"Task complete after {iteration} iterations")
                return {
                    "success": True,
                    "result": final_text,
                    "iterations": iteration,
                    "alerts": self.tools.alerts,
                }

            # Process tool calls
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = self.tools.execute(block.name, block.input)
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result, default=str)
                            if isinstance(result, (dict, list))
                            else str(result),
                        }
                    )

            # Add to conversation
            messages.append({"role": "assistant", "content": response.content})
            if tool_results:
                messages.append({"role": "user", "content": tool_results})

        logger.warning(f"Max iterations ({max_iterations}) reached")
        return {
            "success": False,
            "error": "Max iterations reached",
            "iterations": iteration,
            "alerts": self.tools.alerts,
        }


# ============================================================================
# CLI
# ============================================================================


def main():
    import argparse

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )

    parser = argparse.ArgumentParser(description="Run autonomous agent")
    parser.add_argument("task", help="Task name (e.g., analyze_docket, daily_scan, full_pipeline)")
    parser.add_argument("--docket-id", help="Docket ID for analysis tasks")
    parser.add_argument("--config", help="Path to config file")
    args = parser.parse_args()

    agent = AutonomousAgent(args.config)

    inputs = {}
    if args.docket_id:
        inputs["docket_id"] = args.docket_id

    result = agent.run(args.task, inputs)

    print("\n" + "=" * 60)
    print("RESULT")
    print("=" * 60)
    print(json.dumps(result, indent=2, default=str)[:3000])


if __name__ == "__main__":
    main()
