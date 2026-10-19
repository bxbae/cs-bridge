from types import SimpleNamespace

from app.llm.anthropic_provider import AnthropicProvider


class FakeMessages:
    def __init__(self, replies):
        self.replies, self.calls = list(replies), []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self.replies.pop(0))])


def make(replies):
    p = AnthropicProvider.__new__(AnthropicProvider)
    p.model = "test-model"
    p._client = SimpleNamespace(messages=FakeMessages(replies))
    return p


def test_sends_system_and_parses_json():
    p = make(['```json\n{"category": "billing"}\n```'])
    assert p.complete_json("analyze", "SYS", "USER", {}) == {"category": "billing"}
    call = p._client.messages.calls[0]
    assert call["system"] == "SYS" and call["model"] == "test-model"
    assert call["messages"] == [{"role": "user", "content": "USER"}]


def test_retries_once_when_reply_is_not_json():
    p = make(["Sorry, here you go", '{"ok": true}'])
    assert p.complete_json("summary", "S", "U", {}) == {"ok": True}
    assert "ONLY one valid JSON" in p._client.messages.calls[1]["messages"][0]["content"]
