"use strict";

// Existing regression tests for the invoice list. These run against the full
// synthetic dataset, which is how the console has always been verified.

const test = require("node:test");
const assert = require("node:assert/strict");

const { loadInvoices } = require("../data/store");
const { listInvoices, PAGE_SIZE } = require("../src/invoices");
const { renderPage } = require("../src/views");
const { formatAmount } = require("../src/format");

const invoices = loadInvoices();

test("pagination returns 25 rows per page", () => {
  const result = listInvoices(invoices, {});
  assert.equal(result.rows.length, PAGE_SIZE);
  assert.equal(result.page, 1);
});

test("status filter narrows to a single status", () => {
  const result = listInvoices(invoices, { status: "PAID" });
  for (const invoice of result.rows) {
    assert.equal(invoice.status, "PAID");
  }
});

test("text query matches number or customer", () => {
  const result = listInvoices(invoices, { q: "INV-0000123" });
  assert.ok(result.rows.length > 0);
  assert.ok(result.rows.every((invoice) => invoice.number.includes("INV-0000123")));
});

test("status and query filters combine", () => {
  const result = listInvoices(invoices, { status: "SENT", q: "contoso" });
  for (const invoice of result.rows) {
    assert.equal(invoice.status, "SENT");
    assert.ok(invoice.customer.toLowerCase().includes("contoso"));
  }
});

test("amounts render with grouping and two decimals", () => {
  assert.equal(formatAmount(123456), "$1,234.56");
  assert.equal(formatAmount(5), "$0.05");
});

test("rendered page escapes customer names", () => {
  const result = listInvoices(invoices, { q: "proseware" });
  const html = renderPage(result, { q: "proseware" });
  assert.ok(html.includes("&quot;Prime&quot;"));
  assert.ok(!html.includes('Proseware "Prime"'));
});

test("page beyond the end clamps to the last page", () => {
  const result = listInvoices(invoices, { page: 99999999 });
  assert.equal(result.page, result.totalPages);
});
