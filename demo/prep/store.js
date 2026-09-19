"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { generateInvoices } = require("./generate");

const DATA_FILE = path.join(__dirname, "invoices.json");
const INVOICE_COUNT = Number(process.env.INVOICE_COUNT || 400000);

// INVOICE_FIXTURE points the app and suite at a curated dataset. `npm test`
// leaves it unset and uses the full generated dataset.
function fixturePath() {
  if (!process.env.INVOICE_FIXTURE) return null;
  return path.isAbsolute(process.env.INVOICE_FIXTURE)
    ? process.env.INVOICE_FIXTURE
    : path.join(__dirname, "..", process.env.INVOICE_FIXTURE);
}

function seed() {
  const invoices = generateInvoices(INVOICE_COUNT);
  fs.writeFileSync(DATA_FILE, JSON.stringify(invoices));
  return invoices.length;
}

function loadInvoices() {
  const fixture = fixturePath();
  if (fixture) {
    return JSON.parse(fs.readFileSync(fixture, "utf8"));
  }
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
