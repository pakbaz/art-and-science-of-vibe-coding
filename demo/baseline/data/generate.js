"use strict";

// Deterministic synthetic data. No customer data is used anywhere in this project.

const STATUSES = ["DRAFT", "SENT", "PAID", "CANCELLED"];

const CUSTOMER_STEMS = [
  "Northwind Trading",
  "Contoso Ltd",
  "Fabrikam & Sons",
  "Tailspin Toys",
  "Wide World Importers",
  "Litware Inc",
  "Adventure Works",
  'Proseware "Prime"',
  "Wingtip Toys",
  "Lucerne Publishing",
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(iso, days) {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function generateInvoices(count, seed = 20260918) {
  const random = mulberry32(seed);
  const invoices = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const customer = CUSTOMER_STEMS[Math.floor(random() * CUSTOMER_STEMS.length)];
    const issuedOffset = -Math.floor(random() * 900);
    const issuedAt = addDays("2026-09-18", issuedOffset);
    const termDays = [7, 14, 30, 45, 60][Math.floor(random() * 5)];
    invoices[i] = {
      id: i + 1,
      number: `INV-${String(i + 1).padStart(7, "0")}`,
      customer: `${customer} #${Math.floor(random() * 4000)}`,
      status: STATUSES[Math.floor(random() * STATUSES.length)],
      amountCents: Math.floor(random() * 90000000) + 500,
      issuedAt,
      dueDate: addDays(issuedAt, termDays),
    };
  }
  return invoices;
}

module.exports = { generateInvoices, STATUSES, addDays };
