"""
Shared Claude settings and response handling for the pipeline jobs.

One place for the model ID, so a model retirement is a one-line change.
"""

from typing import Any, Optional

# Current Sonnet. Replaces claude-sonnet-4-20250514, which was retired on 2026-06-15.
MODEL = "claude-sonnet-5-5"

# On a safety refusal, let the API re-run the request on a fallback model it picks.
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class RefusalError(RuntimeError):
    """Raised when the model (and its fallback) declined the request."""


def complete(
    client: Any,
    prompt: str,
    max_tokens: int = 16000,
    effort: Optional[str] = None,
    system: Optional[str] = None,
) -> Any:
    """
    Send a single-turn request and return the raw response.

    Args:
        client: An anthropic.Anthropic client.
        prompt: The user message.
        max_tokens: Output cap. Thinking counts toward it, so keep it generous.
        effort: Optional effort level ("low" | "medium" | "high"); model default if None.
        system: Optional system prompt.

    Returns:
        The API response object.

    Raises:
        RefusalError: If the request was declined.
    """
    kwargs: dict = {
        "model": MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
        "betas": [FALLBACK_BETA],
        "extra_body": {"fallbacks": "default"},
    }
    if effort:
        kwargs["output_config"] = {"effort": effort}
    if system:
        kwargs["system"] = system

    response = client.beta.messages.create(**kwargs)
    if response.stop_reason == "refusal":
        details = getattr(response, "stop_details", None)
        raise RefusalError(f"Request declined: {details}")
    return response


def text_of(response: Any) -> str:
    """Join the text blocks of a response, skipping thinking and other block types."""
    return "".join(
        getattr(block, "text", "") for block in response.content if block.type == "text"
    )


def ask(client: Any, prompt: str, **kwargs: Any) -> str:
    """Single-turn request that returns only the response text."""
    return text_of(complete(client, prompt, **kwargs))
