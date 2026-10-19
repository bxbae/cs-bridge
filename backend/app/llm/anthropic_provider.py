from typing import Any

from .base import LLMError, parse_json_object

MAX_TOKENS = {"analyze": 800, "drafts": 2500, "translate": 1200, "summary": 1000}


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str):
        if not api_key:
            raise LLMError("ANTHROPIC_API_KEY is not set (or use LLM_PROVIDER=mock)")
        import anthropic  # imported lazily so the mock mode needs no SDK

        self._client = anthropic.Anthropic(api_key=api_key, max_retries=2, timeout=60)
        self.model = model

    def complete_json(self, task: str, system: str, user: str, context: dict[str, Any]) -> dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(2):
            prompt = user if attempt == 0 else user + "\n\nReturn ONLY one valid JSON object, no prose."
            response = self._client.messages.create(
                model=self.model,
                max_tokens=MAX_TOKENS.get(task, 1500),
                temperature=0.2,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = "".join(block.text for block in response.content if getattr(block, "type", "") == "text")
            try:
                return parse_json_object(raw)
            except LLMError as exc:
                last_error = exc
        raise LLMError(f"{task}: {last_error}")
