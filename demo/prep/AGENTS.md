# Invoice admin console workflow

This is a server-rendered Node.js application with no external dependencies.
Use Node's built-in test runner.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run test:fast` | Run the repository suite with the curated 100-row fixture |
| `npm test` | Seed 400,000 synthetic invoices and run the same suite |
| `npm start` | Serve `/invoices` on `PORT` (default 3000) |

Use `npm run test:fast` for focused iteration and `npm test` before handing the
work over. Both commands execute `test/`; the fixture only changes the input
size and boundary-case mix.

## Working agreements

- Read `FEATURE-REQUEST.md` before changing code.
- Keep filters composable and pagination at 25 rows.
- Reuse `formatAmount` and `escapeHtml`.
- Test behavior through `buildApp` and the generated HTML.
- Work only in this repository.
- Do not edit `data/generate.js` or `data/fixture-100.json`.

There are no external services and no customer data in this repository.
