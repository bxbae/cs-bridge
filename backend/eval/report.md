# CS Bridge evaluation — mock

## Summary

| Metric | Value |
|---|---|
| Category accuracy (30) | 80.0% |
| Retrieval Hit@1 (28) | 71.4% |
| Retrieval Hit@3 (28) | 92.9% |
| Drafts passing guards | 100.0% |
| Inquiries with ≥1 sendable draft | 100.0% |
| Translation: numbers preserved (10) | 100.0% |
| Translation: glossary compliance (10) | 100.0% |
| Translation: guard pass | 100.0% |
| Guard accuracy (12, rule-based) | 100.0% |
| Guard block recall | 100.0% |
| First draft latency p50 (ms) | 1.2 |
| LLM call errors | 0 |

## Latency by stage (ms)

| Stage | p50 | p95 |
|---|---|---|
| analyze | 0.1 | 0.1 |
| retrieve | 0.1 | 0.1 |
| drafts | 1.1 | 2.7 |
| translate | 0.1 | 0.5 |

Draft risk findings: none

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

## Misses and findings

- category: `Can I get my money back for the crystal pack I bought yesterday? I haven't used any.` → expected refund, got billing
- category: `I want a refund for the 500 crystal pack, bought it 2 days ago` → expected refund, got billing
- category: `My account was stolen, the password doesn't work anymore` → expected account, got other
- category: `Game kicks me out every 5 minutes on wifi` → expected technical, got other
- retrieval: `Game kicks me out every 5 minutes on wifi` → expected KB-LOG-01#2, got ['KB-PAY-01#1', 'KB-LOG-01#1', 'KB-PAT-01#2']
- category: `My Season Pass rewards don't show up in the mailbox` → expected bug, got other
- category: `I lost 3 items after the server crash yesterday, can you restore them?` → expected bug, got technical
- retrieval: `The quest NPC is glitched and I can't finish the story` → expected KB-BUG-01#1, got []

## Errors

- none
