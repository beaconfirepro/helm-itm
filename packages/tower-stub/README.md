# @beacon/tower-stub

A **minimal Tower**: just enough platform (Clerk auth, the app shell with the vertical primary
nav, and Prisma/Supabase DB wiring) for a single module to run **standalone**. It grows into the
real Tower in a later horizon (extracted from Helm's `src/tower/`).

A module codes against Tower's interfaces (auth, nav host, theme, data ports); this stub supplies
the standalone implementations. Placeholder until P2/P4.
