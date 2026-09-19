# B-lane preparation

These files are overlaid only after a pristine worktree is attached:

- `AGENTS.md`: ordinary repository workflow and constraints
- `fixture-100.json`: curated synthetic boundary cases
- `store.js`: optional fixture loading via `INVOICE_FIXTURE`
- `package.json`: cross-platform `test:fast` running the same `test/` suite

No file implements the overdue feature or reveals the external acceptance
suite. `npm test` remains the full 400,000-row final repository check.
