---
"kilo-code": patch
---

fix: prevent context token indicator flickering

Fixed a bug where the context token indicator would flicker to 0% when a new API request started. The issue occurred because the loop would break on placeholder messages without valid token data instead of continuing to search for the last complete message with token data.
