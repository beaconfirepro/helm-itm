---
name: workflow-preferences
description: How the user wants tranches of work reported — URL + manual test list every time
metadata:
  type: feedback
---

When finishing a tranche of work on the Storybook addon project, always:
1. **Repeat the running preview URL** (currently http://localhost:6107) so they don't have to hunt for it.
2. **Provide a short list of manual tests** covering anything I could NOT verify myself — especially interactive/visual behavior in the browser, since the headless preview reports a 0×0 viewport and can't screenshot the panel/canvas reliably.

**Why:** saves them clicking around to find the URL, and makes clear exactly what still needs a human to eyeball vs. what's already verified (unit tests + channel round-trips + computed-style checks).

**How to apply:** end substantive replies with the URL and a "Test these yourself" checklist of the unverified bits. Keep verifying everything I can headlessly (tests, channel round-trips, computed styles, generated-file inspection) — the manual list is only for what's genuinely out of reach.
