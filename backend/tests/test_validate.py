from app.pipeline.retrieve import get_retriever
from app.pipeline.validate import check_reply

R = get_retriever()


def codes(result):
    return {f["code"] for f in result["findings"]}


def test_promise_backed_by_policy_passes():
    src = R.search("maintenance extended compensation")
    assert check_reply("We will send 300 Crystals to your mailbox.", "chat", src)["passed"]


def test_promise_with_invented_amount_is_blocked():
    src = R.search("maintenance extended compensation")
    res = check_reply("We will send 1000 Crystals to your mailbox.", "chat", src)
    assert not res["passed"] and "unsupported_promise" in codes(res)


def test_promise_without_any_source_is_blocked():
    res = check_reply("We will refund you today.", "chat", [])
    assert "unsupported_promise" in codes(res)


def test_restricted_policy_raises_warning():
    src = R.search("refund season pass")
    res = check_reply("We will refund your Season Pass.", "chat", src)
    assert "conditional_policy" in codes(res)


def test_translation_must_keep_numbers_and_terms():
    src = R.search("ban appeal")
    res = check_reply("Please wait 3 days.", "chat", src, source_ko="영업일 3일, 최대 5일 안에 이의 신청 결과를 드립니다.")
    assert {"number_mismatch", "glossary"} <= codes(res)


def test_citation_must_be_retrieved():
    src = R.search("login error 1002")
    res = check_reply("Please update the game.", "chat", src, cited_ids=["KB-REF-01#1"])
    assert "ungrounded_citation" in codes(res)


def test_pii_in_reply_is_blocked():
    res = check_reply("We emailed jordan@gmail.com", "chat", [])
    assert "pii" in codes(res)


def test_email_format():
    res = check_reply("Please restart the game.", "email", [])
    assert {"email_greeting", "email_signoff"} <= codes(res)
    ok = check_reply("Hi Sam,\n\nPlease restart the game.\n\nBest regards,\nEric\nSupport", "email", [])
    assert ok["findings"] == []


def test_glossary_term_digits_and_number_words_are_not_lost_numbers():
    src = R.search("hacked account")
    ok = check_reply("Please reset your password, enable two-step verification, then submit an appeal.", "chat", src,
                     source_ko="비밀번호를 재설정하고 2단계 인증을 켠 다음 이의 신청해 주세요.")
    assert "number_mismatch" not in codes(ok)
    words = check_reply("The review takes three business days.", "chat", R.search("ban appeal"), source_ko="검토는 영업일 3일 걸립니다.")
    assert "number_mismatch" not in codes(words)
    still = check_reply("The review takes a few days.", "chat", R.search("ban appeal"), source_ko="검토는 영업일 3일 걸립니다.")
    assert "number_mismatch" in codes(still)
