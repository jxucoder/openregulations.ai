"""
Decoupled jobs for OpenRegulations.ai

Each job is independent and can be run separately:
- sync: Fetch data from Regulations.gov → DB
- analyze: Read from DB → Claude → DB
- embed: Read from DB → OpenAI embeddings → DB
- report: Generate daily summary

Run jobs via CLI:
    python -m src.jobs.sync
    python -m src.jobs.analyze --docket-id NHTSA-2025-0491
    python -m src.jobs.embed --docket-id NHTSA-2025-0491
    python -m src.jobs.report
"""

from .sync import run_sync, sync_docket
from .analyze import run_analysis, analyze_docket
from .embed import run_embeddings, embed_docket
from .report import generate_daily_report

__all__ = [
    # Sync
    "run_sync",
    "sync_docket",
    # Analyze
    "run_analysis",
    "analyze_docket",
    # Embed
    "run_embeddings",
    "embed_docket",
    # Report
    "generate_daily_report",
]
