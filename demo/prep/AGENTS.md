# Invoice admin console

Server-rendered internal console. No framework. Node's built-in test runner.

## Commands

| Command | What it does | When to use it |
| --- | --- | --- |
| `npm run test:fast` | Runs the suite against `data/fixture-100.json` (100 curated rows) | The inner loop. Use this while you work. |
| `npm test` | Seeds 400,000 synthetic invoices to disk, then runs the suite | Before you hand work over. Slow on purpose. |
| `npm run seed` | Rewrites the full synthetic dataset | Only when the generator changes |
| `npm start` | Serves `/invoices` on `PORT` (default 3000) | Manual checks |

Prefer `npm run test:fast` while iterating. It loads 100 rows instead of
400,000 and it covers the cases that actually break: status boundaries, date
boundaries, escaping and pagination edges. Run `npm test` once at the end.

## Scope

Work in `src/` and `test/`. Do not edit `data/generate.js` or
`data/fixture-100.json`.

## Domain rules that people get wrong

- **Overdue** means the invoice is still owed and its due date has already
  passed. Concretely: `status` is neither `PAID` nor `CANCELLED`, **and**
  `dueDate` is strictly before the as-of date. An invoice due *on* the as-of
  date is not overdue yet.
- The as-of date comes from `INVOICE_AS_OF` (`YYYY-MM-DD`) when it is set.
  Fall back to today. Never read the clock in more than one place.
- Dates are plain `YYYY-MM-DD` strings in UTC. They compare correctly as
  strings; do not convert them to `Date` objects to compare them, because that
  reintroduces a timezone bug we already fixed once.

## Constraints that are easy to break

- Pagination is 25 rows per page. It is asserted in the suite.
- Amount formatting (`$1,234.56`) is shared by every view. Do not reimplement it.
- Every value rendered into HTML goes through `escapeHtml`. One customer in the
  fixture contains quotes and a `<script>` tag for exactly this reason.
- Filters compose. A new filter must work alongside `q`, `status` and
  `customer`, not replace them.

## Verifying UI behaviour

Assert against the HTML the application actually generated, via `buildApp` in
`src/server.js`. Do not launch a browser for routine table checks; the browser
smoke check runs once at the final gate, not in the inner loop.

## Environment

- No network access is needed. There are no external dependencies.
- The dataset is synthetic. There is no customer data in this repository.
