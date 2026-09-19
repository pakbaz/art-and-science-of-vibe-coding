"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { generateInvoices } = require("./generate");

const DATA_FILE = path.join(__dirname, "invoices.json");
const INVOICE_COUNT = Number(process.env.INVOICE_COUNT || 400000);

// The console has always been verified against a full seeded dataset. `npm run
// seed` rewrites it; the server and the test suite read it back.
function seed() {
  const invoices = generateInvoices(INVOICE_COUNT);
  fs.writeFileSync(DATA_FILE, JSON.stringify(invoices));
  return invoices.length;
}

function loadInvoices() {
  if (!fs.existsSync(DATA_FILE)) {
    seed();
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

if (require.main === module) {
  const count = seed();
  process.stdout.write(`seeded ${count} invoices into ${DATA_FILE}\n`);
}

module.exports = { seed, loadInvoices, DATA_FILE };
