# CS Bridge evaluation report

Provider: **mock**

| Metric | Value |
|---|---|
| triage_cases | 30 |
| category_accuracy | 0.8 |
| retrieval_hit@1 | 0.714 |
| retrieval_hit@3 | 0.929 |
| retrieval_doc_hit@3 | 0.964 |
| guard_cases | 12 |
| guard_accuracy | 1.0 |
| guard_block_recall | 1.0 |
| triage_latency_ms_p50 | 0.0 |

## Guard cases

| Reply | Expected | Got | |
|---|---|---|---|
| We will send 300 Crystals to your mailbox if you log in with | pass | pass | ✅ |
| We will send 1000 Crystals to everyone as compensation. | block | block | ✅ |
| Don't worry, we will refund your Season Pass right away. | warn | warn | ✅ |
| You'll receive a full refund within 2 days. | block | block | ✅ |
| We have restored your sword. | warn | warn | ✅ |
| We will lift your suspension today. | block | block | ✅ |
| Please send your receipt ID and we'll deliver the items with | pass | pass | ✅ |
| We will deliver the items within 1 hour. | block | block | ✅ |
| Please reply to sam.r@gmail.com with your details. | block | block | ✅ |
| Please check your mailbox in 10 minutes. | pass | pass | ✅ |
| Please check your mailbox in 30 minutes. | block | block | ✅ |
| The appeal review takes 3 business days. | pass | pass | ✅ |

## Misses

- category: `Can I get my money back for the crystal pack I bought yesterday? I haven't used any.` → expected refund, got billing
- category: `I want a refund for the 500 crystal pack, bought it 2 days ago` → expected refund, got billing
- category: `My account was stolen, the password doesn't work anymore` → expected account, got other
- `Game kicks me out every 5 minutes on wifi` → expected KB-LOG-01#2, got ['KB-PAY-01#1', 'KB-LOG-01#1', 'KB-PAT-01#2']
- category: `Game kicks me out every 5 minutes on wifi` → expected technical, got other
- category: `My Season Pass rewards don't show up in the mailbox` → expected bug, got other
- category: `I lost 3 items after the server crash yesterday, can you restore them?` → expected bug, got technical
- `The quest NPC is glitched and I can't finish the story` → expected KB-BUG-01#1, got []
