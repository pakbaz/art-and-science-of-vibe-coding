"use strict";

process.env.INVOICE_AS_OF = "2026-09-18";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { formatAmount } = require("../src/format");
const { buildApp } = require("../src/server");

const invoices = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "fixture-100.json"), "utf8"),
);
const expectedOverdue = invoices.filter(
  (invoice) => invoice.status === "SENT" && invoice.dueDate < process.env.INVOICE_AS_OF,
);

function render(query) {
  let html = "";
  buildApp(invoices)(
    { url: `/invoices?${query}`, method: "GET" },
    {
      writeHead() {},
      end(body) {
        html = String(body);
      },
    },
  );
  return html;
}

function idsIn(html) {
  return [...html.matchAll(/data-invoice-id="(\d+)"/g)].map((match) => Number(match[1]));
}

test("prepared overdue workflow filters strict SENT dates across pages", () => {
  const pages = Math.max(1, Math.ceil(expectedOverdue.length / 25));
  const actual = [];
  for (let page = 1; page <= pages; page += 1) {
    actual.push(...idsIn(render(`overdue=1&page=${page}`)));
  }
  assert.deepEqual(actual, expectedOverdue.map((invoice) => invoice.id));
});

test("prepared overdue workflow preserves controls and full-result summary", () => {
  const html = render("overdue=1&page=1");
  const total = expectedOverdue.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  assert.match(html, /name="overdue"[^>]*value="1"[^>]*checked|checked[^>]*name="overdue"/i);
  assert.match(html, new RegExp(`\\b${expectedOverdue.length}\\b`));
  assert.ok(html.includes(formatAmount(total)));
  if (expectedOverdue.length > 25) {
    assert.match(html.replace(/&amp;/g, "&"), /href="[^"]*overdue=1[^"]*page=2|href="[^"]*page=2[^"]*overdue=1/);
  }
});

test("prepared overdue workflow composes with existing filters", () => {
  const expected = expectedOverdue.filter(
    (invoice) => invoice.status === "SENT" && invoice.customer.includes("Northwind"),
  );
  const html = render("overdue=1&status=SENT&customer=Northwind");
  assert.deepEqual(idsIn(html), expected.slice(0, 25).map((invoice) => invoice.id));
});
