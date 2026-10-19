import pytest

from app.pipeline.retrieve import get_retriever

CASES = [
    ("I bought 500 crystals but never got them", "KB-PAY-01#1"),
    ("I was charged twice for the same pack", "KB-PAY-01#3"),
    ("refund my season pass please", "KB-REF-01#2"),
    ("my account got banned for no reason", "KB-ACC-01#1"),
    ("someone hacked my account", "KB-ACC-01#3"),
    ("game keeps showing error 1002 when I log in", "KB-LOG-01#1"),
    ("maintenance was extended do we get compensation", "KB-PAT-01#3"),
    ("my sword disappeared after the update", "KB-BUG-01#2"),
]


@pytest.mark.parametrize("query,expected", CASES)
def test_top1(query, expected):
    assert get_retriever().search(query, top_k=3)[0]["id"] == expected
