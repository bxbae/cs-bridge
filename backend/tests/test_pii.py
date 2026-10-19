from app.pipeline.pii import mask_pii


def test_masks_email_and_card_but_keeps_order_ids():
    text = "Mail me at kim.j@gmail.com, card 4111 1111 1111 1111, order GPA.3381-2210-4467-12345"
    masked, types = mask_pii(text)
    assert "[EMAIL]" in masked and "[CARD]" in masked
    assert "GPA.3381-2210-4467-12345" in masked
    assert types == ["email", "card"]


def test_masks_formatted_phone_not_plain_numbers():
    masked, types = mask_pii("Call +1 415-555-0132. Apple order 2847561930, level 85")
    assert "[PHONE]" in masked
    assert "2847561930" in masked and "85" in masked
    assert types == ["phone"]


def test_support_address_is_not_pii():
    masked, types = mask_pii("Write to help@starfall-odyssey.com")
    assert types == [] and masked.endswith("help@starfall-odyssey.com")
