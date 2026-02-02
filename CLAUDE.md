# OpenRegulations.ai - Project Guidelines

## Overview

AI-powered analysis of federal regulatory comments from Regulations.gov. The system fetches public comments, detects form letter campaigns, extracts themes, analyzes sentiment, and generates executive summaries.

## Architecture

```
src/
├── agents/          # Standalone analysis agents (comment_analyzer.py)
├── autonomous/      # Autonomous agent system with prompts
├── db/              # Supabase client and data models
├── jobs/            # Scheduled jobs (sync, analyze, embed, report)
└── orchestration/   # LangGraph workflow orchestration

website/             # Vite + Tailwind static site
supabase/            # Database migrations and config
```

## Package Management

This project uses **uv** for Python package management.

```bash
# Install dependencies
uv sync

# Activate virtual environment
source .venv/bin/activate

# Add a package
uv add <package>

# Run a script
uv run python <script.py>
```

### Key Files

- `pyproject.toml` - Project configuration and dependencies
- `uv.lock` - Locked dependencies (auto-generated, commit this)

## Running Jobs

```bash
# Sync comments from Regulations.gov
uv run python -m src.jobs.sync --docket-id NHTSA-2025-0491

# Run AI analysis on a docket
uv run python -m src.jobs.analyze --docket-id NHTSA-2025-0491

# Generate embeddings for semantic search
uv run python -m src.jobs.embed --docket-id NHTSA-2025-0491

# Generate report
uv run python -m src.jobs.report
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Purpose | Required |
|----------|---------|----------|
| `SUPABASE_URL` | Database URL | Yes |
| `SUPABASE_SECRET_KEY` | Database auth | Yes |
| `REGULATIONS_API_KEY` | Regulations.gov API | Yes |
| `ANTHROPIC_API_KEY` | Claude for analysis | Yes |
| `OPENAI_API_KEY` | Embeddings | For embed job |

## Code Style

### Python

- **PEP 8** conventions with 100 char line length
- **Type hints** for all function signatures
- **Docstrings** for public functions and classes
- **Linting**: `uv run ruff check .`
- **Formatting**: `uv run ruff format .`

### Naming Conventions

- Files: `snake_case.py`
- Classes: `PascalCase`
- Functions/variables: `snake_case`
- Constants: `UPPER_SNAKE_CASE`

### Example Function

```python
def analyze_comments(
    docket_id: str,
    limit: int = 100,
    exclude_form_letters: bool = True
) -> AnalysisResult:
    """
    Analyze comments for a regulatory docket.
    
    Args:
        docket_id: The Regulations.gov docket ID (e.g., NHTSA-2025-0491)
        limit: Maximum number of comments to analyze
        exclude_form_letters: Whether to filter out detected form letters
        
    Returns:
        AnalysisResult containing themes, sentiment, and summary
        
    Raises:
        ValueError: If docket_id is invalid
        APIError: If Regulations.gov API fails
    """
```

## Common Patterns

### Database Access

```python
from src.db.client import get_client

db = get_client()
docket = db.get_docket("NHTSA-2025-0491")
comments = db.get_comments("NHTSA-2025-0491", limit=100)
```

### API Calls to Regulations.gov

```python
import os
import requests

api_key = os.environ.get("REGULATIONS_API_KEY")
if not api_key:
    raise ValueError("REGULATIONS_API_KEY required")

headers = {"X-Api-Key": api_key}
response = requests.get(url, headers=headers)
```

### LLM Calls with Anthropic

```python
from anthropic import Anthropic

client = Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=2000,
    messages=[{"role": "user", "content": prompt}]
)
```

## Testing

```bash
# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov=src

# Run specific test file
uv run pytest tests/test_sync.py -v
```

## Website Development

```bash
cd website
npm install
npm run dev      # Start dev server at localhost:3000
npm run build    # Build for production
```

## Important Notes

- **Never hardcode API keys** - Always use environment variables
- **Rate limits**: Regulations.gov API has 1,000 requests/hour limit
- **Form letters**: ~50-60% of comments are typically form letters
- **Embeddings**: Only generate for non-form-letter comments to save costs

## Git Workflow

- Create feature branches from `main`
- Use conventional commit messages
- Run `ruff check .` before committing
- PRs require passing CI checks
