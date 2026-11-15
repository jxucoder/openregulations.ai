# OpenRegulations.ai

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)

**AI-powered analysis of federal regulatory comments.** Surface signal from noise in the public rulemaking process.

## The Problem

Every year, federal agencies receive millions of public comments on proposed regulations. But:
- **90%+ are form letters** from organized campaigns
- **Dense legal language** makes rules incomprehensible to most citizens
- **Agencies struggle** to find substantive feedback in the noise
- **Citizens feel unheard** and disengage from the process

## What This Does

OpenRegulations.ai analyzes public comments on [Regulations.gov](https://www.regulations.gov) to:

- **Detect form letter campaigns** - Separate coordinated campaigns from original comments
- **Extract themes** - Identify the key arguments and concerns
- **Analyze sentiment** - Understand public support vs opposition
- **Surface notable quotes** - Find the most compelling arguments
- **Generate summaries** - Create executive briefings on any docket

## Quick Start

### Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) for package management
- API Keys:
  - `REGULATIONS_API_KEY` - [Get free key](https://api.data.gov/signup/)
  - `ANTHROPIC_API_KEY` - [Get from Anthropic](https://console.anthropic.com/)

### Installation

```bash
# Clone the repository
git clone https://github.com/jxucoder/openregulations.ai.git
cd openregulations.ai

# Install dependencies with uv
uv sync

# Copy environment template
cp .env.example .env
# Edit .env with your API keys
```

### Run Analysis

```bash
# Activate virtual environment
source .venv/bin/activate

# Analyze a docket
python -m src.agents.comment_analyzer \
  --docket NHTSA-2025-0491 \
  --limit 100 \
  --output analysis.json
```

### Example Output

```
┌─────────────────────────────────────────────────────┐
│  DOCKET: NHTSA-2025-0491                            │
│  Fuel Efficiency Standards                          │
├─────────────────────────────────────────────────────┤
│  📊 4,957 comments analyzed                         │
│                                                     │
│  SENTIMENT          THEMES                          │
│  ██████░░ 62% oppose   1. Consumer choice (34%)    │
│  ███░░░░░ 28% support  2. Climate impact (29%)     │
│  █░░░░░░░ 10% neutral  3. Safety concerns (21%)    │
│                                                     │
│  ⚠️  Form letters: 54% of comments                 │
└─────────────────────────────────────────────────────┘
```

## Project Structure

```
openregulations.ai/
├── src/
│   ├── agents/           # Analysis agents
│   ├── autonomous/       # Autonomous agent system
│   ├── db/              # Database client
│   ├── jobs/            # Scheduled jobs (sync, analyze, embed)
│   └── orchestration/   # LangGraph orchestration
├── website/             # Static website (Vite + Tailwind)
└── supabase/            # Database migrations
```

## Running Jobs

```bash
# Sync comments from Regulations.gov
uv run python -m src.jobs.sync --docket-id NHTSA-2025-0491

# Run AI analysis
uv run python -m src.jobs.analyze --docket-id NHTSA-2025-0491

# Generate embeddings for semantic search
uv run python -m src.jobs.embed --docket-id NHTSA-2025-0491
```

## Development

```bash
# Install dev dependencies
uv sync --extra dev

# Run linter
uv run ruff check .

# Format code
uv run ruff format .
```

## Deployment

### GitHub Actions

The repo includes workflows for:
- **Daily sync** - Fetch new comments every 6 hours
- **Analysis** - Run AI analysis daily
- **Website** - Deploy to GitHub Pages on push

See `.github/workflows/` for configuration.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on:
- Setting up your development environment
- Our code style and standards
- The pull request process

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Data from [Regulations.gov](https://www.regulations.gov) via their public API
- AI models from [Anthropic](https://www.anthropic.com) and [OpenAI](https://openai.com)
- All prompts are open source and available in this repository
- This is a technical learning project for exploring AI/LLM applications
