# Invoice admin console

A small server-rendered Node.js console for browsing synthetic invoices. It has
no external dependencies.

## Commands

```bash
npm test        # seed 400,000 synthetic invoices and run the full suite
npm start       # serve http://localhost:3000/invoices
```

Set `PORT` to choose another port. All data is synthetic and generated locally.
The application supports text, status, and customer filters with 25-row
pagination.
