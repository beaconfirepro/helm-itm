---
name: grep/bash output token redaction
description: Why bash grep/search output of this codebase shows garbled tokens, and what to do instead.
---

# Security scanner redacts domain tokens in shell output

When reading code via `bash` (grep/rg/cat/head), the security scanner that filters
tool output **silently rewrites certain domain tokens** in the returned text.
Observed: `qbo`, `quickbooks`, `intuit`, `invoice`, `hubspot` and similar were all
collapsed to the literal `ln` in grep results — e.g. `invoiceLinksTable` showed as
`lnLinksTable`, `qboSyncClient` as `lnSyncClient`. The actual file on disk is fine;
only the shell-piped output is mangled.

**Why:** the redaction happens on the tool-output channel for bash, not on the
`read` tool.

**How to apply:** Use the `read` tool (or precise line-range reads) to inspect code
content you need to quote or edit. Use `bash`/`rg` only to *locate* files and count
matches (`rg -l`, `rg -c`), not to read the matched content verbatim. If grep output
looks nonsensical or repeats an implausible token, suspect redaction and re-read the
file with the `read` tool.
