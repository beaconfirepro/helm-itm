---
name: Replit cartographer generic JSX
description: The Replit cartographer vite plugin breaks on TypeScript generic JSX syntax like <Component<T>.
---

**Rule:** Never use explicit TypeScript generic syntax on JSX elements like `<ResponsiveTable<ProjectRow>`. The Replit cartographer plugin injects `data-replit-metadata` attributes between the component name and the type param, producing malformed JSX that crashes the Vite dev server with a parse error.

**Why:** The plugin does string-based attribute injection without understanding TypeScript generics in JSX.

**How to apply:** Remove the explicit type param from JSX — TypeScript almost always infers it from the `columns`/`rows`/`data` props. If you must preserve it, use a typed intermediate variable: `const Table = ResponsiveTable as React.ComponentType<ResponsiveTableProps<T>>`.
