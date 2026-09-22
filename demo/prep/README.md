# B-lane preparation

These files are overlaid only after a pristine worktree is attached:

- `AGENTS.md`: ordinary repository workflow and constraints
- `fixture-100.json`: curated synthetic boundary cases
- `store.js`: optional fixture loading via `INVOICE_FIXTURE`
- `package.json`: cross-platform `test:fast` running the same `test/` suite
- `overdue.prep.test.js`: focused red tests derived from the public feature
  request, not from the external acceptance gate

The runner commits this overlay as one auditable B-only preparation commit so
the measured child turn starts from a clean worktree. No file implements the
overdue feature or reveals the external acceptance suite. The coordinator's
`npm test` remains the full 400,000-row final repository check.
