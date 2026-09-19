# Feature request: overdue invoices

Add an **Overdue only** checkbox to the existing invoice list at
`GET /invoices`.

## Behaviour

- The checkbox submits `overdue=1` when checked and is omitted when unchecked.
- An invoice is overdue only when:
  - `status` is exactly `SENT`; and
  - `dueDate` is strictly before the as-of date.
- `DRAFT` invoices have not been issued and are never overdue.
- `PAID` and `CANCELLED` invoices are never overdue.
- An invoice due on the as-of date is not overdue.
- Dates are UTC calendar dates in `YYYY-MM-DD` form.
- Use `INVOICE_AS_OF` when it is a valid `YYYY-MM-DD` value. Otherwise use
  today's UTC date.

## Filtering and pagination

- The overdue filter must compose with the existing `q`, `status`, and
  `customer` filters.
- Keep the existing 25-row page size.
- Filter links and pagination links must preserve all active filters.
- The checkbox must remain checked while the filter is active.

## Summary

For the complete filtered result set, before pagination, show:

- the number of matching invoices; and
- the total outstanding amount.

The total must include every matching page, not only the current page. Amounts
must continue to use the existing shared currency formatter.

Keep existing escaping, amount formatting, filters, and unfiltered behaviour
working.
