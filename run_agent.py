"""
Master entry point for the OpenRegulations autonomous agent system.

This is the single command that runs everything. The agent decides what
to do based on the current state of the system.

Usage:
    # Full autonomous pipeline (sync -> analyze -> embed -> report)
    python run_agent.py

    # Specific tasks
    python run_agent.py --task daily_scan
    python run_agent.py --task analyze_docket --docket-id NHTSA-2025-0491
    python run_agent.py --task full_pipeline

    # Pipeline mode (state machine, no LLM orchestration)
    python run_agent.py --pipeline --docket-id NHTSA-2025-0491

    # Direct job execution (no agent, just run the jobs)
    python run_agent.py --direct sync
    python run_agent.py --direct analyze
    python run_agent.py --direct embed
    python run_agent.py --direct report
    python run_agent.py --direct all
"""

import argparse
import json
import logging
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv()


def run_agent_task(task: str, docket_id: str = None, config: str = None) -> dict:
    """Run the autonomous agent on a task."""
    from src.autonomous.agent import AutonomousAgent

    agent = AutonomousAgent(config)
    inputs = {}
    if docket_id:
        inputs["docket_id"] = docket_id

    return agent.run(task, inputs)


def run_pipeline(docket_id: str) -> dict:
    """Run the state machine pipeline for a specific docket."""
    from src.orchestration.graph import run_pipeline

    return run_pipeline(docket_id)


def run_direct(job: str, docket_id: str = None) -> dict:
    """Run jobs directly without agent orchestration."""
    results = {}

    if job in ("sync", "all"):
        from src.jobs.sync import run_sync, sync_docket

        if docket_id:
            results["sync"] = sync_docket(docket_id)
        else:
            results["sync"] = run_sync()

    if job in ("analyze", "all"):
        from src.jobs.analyze import analyze_docket, run_analysis

        if docket_id:
            results["analyze"] = analyze_docket(docket_id)
        else:
            results["analyze"] = run_analysis()

    if job in ("embed", "all"):
        from src.jobs.embed import embed_docket, run_embeddings

        if docket_id:
            results["embed"] = embed_docket(docket_id)
        else:
            results["embed"] = run_embeddings()

    if job in ("report", "all"):
        from src.jobs.report import generate_daily_report

        results["report"] = generate_daily_report()

    return results


def main():
    parser = argparse.ArgumentParser(
        description="OpenRegulations.ai - Autonomous Agent System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_agent.py                          # Full autonomous pipeline
  python run_agent.py --task daily_scan        # Agent-driven daily scan
  python run_agent.py --task analyze_docket --docket-id NHTSA-2025-0491
  python run_agent.py --pipeline --docket-id NHTSA-2025-0491
  python run_agent.py --direct all             # Run all jobs directly
  python run_agent.py --direct sync            # Sync only
        """,
    )

    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--task", help="Agent task to run (e.g., full_pipeline, daily_scan, analyze_docket)"
    )
    mode.add_argument(
        "--pipeline",
        action="store_true",
        help="Run state machine pipeline for a docket (requires --docket-id)",
    )
    mode.add_argument(
        "--direct",
        choices=["sync", "analyze", "embed", "report", "all"],
        help="Run a job directly without agent orchestration",
    )

    parser.add_argument("--docket-id", help="Target docket ID")
    parser.add_argument("--config", help="Path to agent config file")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")

    args = parser.parse_args()

    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    start = datetime.now(timezone.utc)
    print(f"[AGENT] Starting at {start.strftime('%Y-%m-%d %H:%M:%S UTC')}")

    try:
        if args.pipeline:
            if not args.docket_id:
                parser.error("--pipeline requires --docket-id")
            print(f"[AGENT] Running pipeline for {args.docket_id}")
            result = run_pipeline(args.docket_id)

        elif args.direct:
            print(f"[AGENT] Running direct job: {args.direct}")
            result = run_direct(args.direct, args.docket_id)

        else:
            # Default: agent-driven full pipeline
            task = args.task or "full_pipeline"
            print(f"[AGENT] Running autonomous task: {task}")
            result = run_agent_task(task, args.docket_id, args.config)

        # Output results
        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        print(f"\n{'=' * 60}")
        print(f"COMPLETED in {elapsed:.1f}s")
        print(f"{'=' * 60}")
        print(json.dumps(result, indent=2, default=str)[:5000])

        # Exit with appropriate code
        if isinstance(result, dict) and result.get("success") is False:
            sys.exit(1)

    except Exception as e:
        elapsed = (datetime.now(timezone.utc) - start).total_seconds()
        logging.error(f"Failed after {elapsed:.1f}s: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
