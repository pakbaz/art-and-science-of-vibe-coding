"use strict";

// Builds the curated 100-case fixture used by `npm run test:fast`.
//
// These are chosen cases, not the first hundred rows of the dataset. Each block
// exists to answer a question that the full 400,000-row dataset answers slowly
// and by accident. Regenerate with:
//
//   node demo/prep/build-fixture.js

const fs = require("node:fs");
const path = require("node:path");

const AS_OF = "2026-09-18";
const rows = [];

function add(id, status, dueDate, options = {}) {
  rows.push({
    id,
    number: `INV-${String(id).padStart(7, "0")}`,
    customer: options.customer || "Contoso Ltd #100",
    status,
    amountCents: options.amountCents === undefined ? 123456 : options.amountCents,
    issuedAt: options.issuedAt || "2026-01-02",
    dueDate,
  });
}

// --- date boundaries around the as-of date ------------------------------------
add(1, "SENT", "2026-09-16"); // two days past due
add(2, "SENT", "2026-09-17"); // one day past due
add(3, "SENT", AS_OF); // due exactly today: not overdue
add(4, "SENT", "2026-09-19"); // due tomorrow
add(5, "DRAFT", "2026-09-17"); // past due but never sent

// --- settled invoices must never count as overdue -----------------------------
add(6, "PAID", "2026-01-15");
add(7, "PAID", "2026-09-17");
add(8, "CANCELLED", "2026-01-15");
add(9, "CANCELLED", "2026-09-17");

// --- calendar traps -----------------------------------------------------------
add(10, "SENT", "2026-02-28");
add(11, "SENT", "2028-02-29", { issuedAt: "2028-01-30" }); // leap day, future
add(12, "SENT", "2024-02-29"); // leap day, past
add(13, "SENT", "2026-08-31"); // month boundary
add(14, "SENT", "2026-09-01"); // month boundary
add(15, "SENT", "2025-12-31"); // year boundary
add(16, "SENT", "2026-01-01"); // year boundary

// --- formatting and escaping --------------------------------------------------
add(17, "SENT", "2026-03-01", { customer: 'Proseware "Prime" <script>alert(1)</script>' });
add(18, "SENT", "2026-03-02", { customer: "Fabrikam & Sons" });
add(19, "SENT", "2026-03-03", { customer: "O'Neill Supply" });
add(20, "SENT", "2026-03-04", { amountCents: 5 }); // $0.05
add(21, "SENT", "2026-03-05", { amountCents: 100000000 }); // $1,000,000.00
add(22, "PAID", "2026-03-06", { amountCents: 99 }); // $0.99, settled

// --- rows the existing suite depends on ---------------------------------------
add(123, "SENT", "2026-04-01", { customer: "Contoso Ltd #123" });

// --- bulk rows so pagination boundaries are reachable --------------------------
let id = 200;
while (rows.length < 100) {
  const bucket = rows.length % 4;
  if (bucket === 0) add(id, "SENT", "2026-05-01");
  else if (bucket === 1) add(id, "SENT", "2026-06-01", { customer: "Northwind Trading #" + id });
  else if (bucket === 2) add(id, "PAID", "2026-05-15");
  else add(id, "SENT", "2026-12-01", { customer: "Litware Inc #" + id }); // not yet due
  id += 1;
}

const overdue = rows.filter(
  (row) => row.status === "SENT" && row.dueDate < AS_OF,
);

const target = path.join(__dirname, "fixture-100.json");
fs.writeFileSync(target, JSON.stringify(rows, null, 0));
process.stdout.write(
  `wrote ${rows.length} curated invoices to ${target} (${overdue.length} overdue as of ${AS_OF})\n`,
);
