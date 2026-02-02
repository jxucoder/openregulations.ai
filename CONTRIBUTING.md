# Contributing to OpenRegulations.ai

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/openregulations.ai.git
   cd openregulations.ai
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/openregulations.ai.git
   ```

## Development Setup

### Prerequisites

- Python 3.11 or higher
- Node.js 18+ (for website development)
- [uv](https://docs.astral.sh/uv/) package manager

### Installation

```bash
# Create virtual environment and install all dependencies
uv sync --extra dev

# Activate the virtual environment
source .venv/bin/activate

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys
```

### Running Tests

```bash
# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov=src
```

### Running the Linter

```bash
# Check for issues
uv run ruff check .

# Auto-fix issues
uv run ruff check --fix .

# Format code
uv run ruff format .
```

## Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/add-theme-visualization` - New features
- `fix/form-letter-detection` - Bug fixes
- `docs/update-quickstart` - Documentation updates
- `refactor/simplify-orchestrator` - Code refactoring

### Commit Messages

Write clear, concise commit messages:

```
Short summary (50 chars or less)

More detailed explanation if necessary. Wrap at 72 characters.
Explain the problem this commit solves and why.

- Bullet points are okay
- Use present tense ("Add feature" not "Added feature")
```

### What to Work On

Check the [Issues](https://github.com/OWNER/openregulations.ai/issues) page for:
- Issues labeled `good first issue` - Great for newcomers
- Issues labeled `help wanted` - We'd love community help
- Feature requests and bug reports

## Pull Request Process

1. **Update your fork** with the latest upstream changes:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes** and commit them

4. **Run tests and linting** before submitting:
   ```bash
   uv run ruff check .
   uv run pytest
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request** on GitHub with:
   - A clear title and description
   - Reference to any related issues (e.g., "Fixes #123")
   - Screenshots if UI changes are involved

7. **Respond to feedback** - maintainers may request changes

## Style Guidelines

### Python

- Follow [PEP 8](https://pep8.org/) conventions
- Use type hints for function signatures
- Write docstrings for public functions and classes
- Maximum line length: 100 characters
- Use `ruff` for linting and formatting

Example:

```python
def analyze_comments(
    docket_id: str,
    limit: int = 100,
    exclude_form_letters: bool = True
) -> AnalysisResult:
    """
    Analyze comments for a regulatory docket.
    
    Args:
        docket_id: The Regulations.gov docket ID
        limit: Maximum number of comments to analyze
        exclude_form_letters: Whether to filter out form letters
        
    Returns:
        AnalysisResult containing themes, sentiment, and summary
    """
    ...
```

### JavaScript

- Use ES6+ features
- Prefer `const` over `let`, avoid `var`
- Use meaningful variable names
- Add JSDoc comments for functions

### Documentation

- Use Markdown for all documentation
- Keep language clear and accessible
- Include code examples where helpful
- Update relevant docs when changing functionality

## Reporting Issues

### Bug Reports

Include:
- Clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Environment details (OS, Python version, etc.)
- Error messages or logs if applicable

### Feature Requests

Include:
- Clear description of the feature
- Use case / why it would be valuable
- Any implementation ideas you have

## Questions?

If you have questions about contributing, feel free to:
- Open a [Discussion](https://github.com/OWNER/openregulations.ai/discussions)
- Ask in an issue

Thank you for contributing to OpenRegulations.ai!
