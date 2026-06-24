---
name: wouter component reuse on param/query change
description: wouter reuses (not remounts) a route component when only its params or query string change; URL-derived state must be resynced via effect.
---

When navigating between two URLs handled by the SAME wouter `<Route>` (e.g.
`/projects/A?tab=filing` -> `/projects/B?tab=deadlines`, or just a query-string
change on the same path), wouter updates the component in place rather than
remounting it. State initialized once from `useSearch()`/params in a `useState`
initializer will go stale.

**Why:** A tabbed project workspace read `tab`/`stream` from the query string only
in the state initializer. Clicking an in-app link to another `?tab=...&stream=...`
URL left the old tab/stream showing because no effect watched the search string.

**How to apply:** If a component derives state from the URL (params or query) and
can be navigated to again while already mounted, add a `useEffect` keyed on the
search/param value that re-parses and updates that state. Only mount-time init is
not enough.
