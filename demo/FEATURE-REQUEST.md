Add an overdue filter to the invoice admin list.

Support was asking for a way to see which invoices are overdue without exporting
to a spreadsheet.

Interface, so it matches the rest of the console:
- `GET /invoices?overdue=1` filters the list to overdue invoices.
- It must combine with the filters that already exist (`q`, `status`, `customer`)
  and with pagination.
- Treat the environment variable `INVOICE_AS_OF` (format YYYY-MM-DD) as the
  current date when it is set; otherwise use today.

Keep the rest of the page working as it does now.
