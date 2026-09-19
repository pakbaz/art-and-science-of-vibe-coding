"use strict";

// SHARED FINAL GATE.
//
// This suite is deliberately kept outside both run workspaces. It is copied in
// and executed only after a run reports that it is finished, so neither run can
// develop against it. It exercises the feature through the application's real
// public surface: the HTTP handler and the HTML the application actually
// generates. It is not a scale test, and it says nothing about JavaScript
// behaviour, layout or accessibility. Those stay with the browser smoke check.

process.env.INVOICE_AS_OF = "2026-09-18";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const APP_ROOT = process.env.APP_ROOT || process.cwd();
const DATA_FILE = path.join(APP_ROOT, "data", "invoices.json");

const AS_OF = "2026-09-18";

function invoice(id, status, dueDate, extra = {}) {
  return {
    id,
    number: `INV-${String(id).padStart(7, "0")}`,
    customer: extra.customer || `Contoso Ltd #${id}`,
    status,
    amountCents: extra.amountCents === undefined ? 123456 : extra.amountCents,
    issuedAt: "2026-01-01",
    dueDate,
    ...extra,
  };
}

// Curated edge cases. Every row exists to answer one question.
const FIXTURE = [
  invoice(1, "SENT", "2026-09-17", { customer: "Northwind Trading #1" }), // overdue by one day
  invoice(2, "DRAFT", "2026-01-15"), // long overdue, not yet sent
  invoice(3, "SENT", "2026-09-18"), // due today, NOT overdue
  invoice(4, "SENT", "2026-09-19", { customer: "Northwind Trading #4" }), // future, not overdue
  invoice(5, "PAID", "2026-01-15"), // settled, excluded even though past due
  invoice(6, "CANCELLED", "2026-01-15"), // cancelled, excluded
  invoice(7, "SENT", "2026-02-29", { customer: 'Proseware "Prime" <script>' }), // leap day + escaping
  invoice(8, "SENT", "2026-08-31"), // month boundary
  invoice(9, "SENT", "2026-09-01"), // month boundary
  invoice(10, "PAID", "2026-09-17"), // recently paid, excluded
  invoice(46, "DRAFT", "2026-12-01"), // draft not yet due, excluded even with status=DRAFT
];

for (let id = 11; id <= 45; id += 1) {
  FIXTURE.push(invoice(id, "SENT", "2026-05-01")); // bulk overdue rows for pagination
}

const OVERDUE_IDS = FIXTURE.filter(
  (row) => row.status !== "PAID" && row.status !== "CANCELLED" && row.dueDate < AS_OF,
).map((row) => row.id);

fs.writeFileSync(DATA_FILE, JSON.stringify(FIXTURE));

const { buildApp } = require(path.join(APP_ROOT, "src", "server.js"));
const handler = buildApp(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));

function request(query) {
  return new Promise((resolve) => {
    const chunks = [];
    const response = {
      statusCode: 200,
      headers: {},
      writeHead(code, headers) {
        this.statusCode = code;
        this.headers = headers || {};
      },
      end(body) {
        if (body) chunks.push(body);
        resolve({ status: this.statusCode, html: chunks.join("") });
      },
    };
    handler({ url: `/invoices?${query}`, method: "GET" }, response);
  });
}

function idsIn(html) {
  return [...html.matchAll(/data-invoice-id="(\d+)"/g)].map((match) => Number(match[1]));
}

test("gate: overdue filter returns only unpaid invoices past the as-of date", async () => {
  const { html } = await request("overdue=1");
  const ids = idsIn(html);
  assert.ok(ids.length > 0, "expected the overdue filter to return rows");
  const expectedFirstPage = OVERDUE_IDS.slice(0, 25);
  assert.deepEqual(ids, expectedFirstPage);
});

test("gate: invoices due exactly on the as-of date are not overdue", async () => {
  const { html } = await request("overdue=1&page=1");
  assert.ok(!idsIn(html).includes(3), "invoice 3 is due today and must not be overdue");
});

test("gate: paid and cancelled invoices are excluded even when past due", async () => {
  const pages = await Promise.all([request("overdue=1&page=1"), request("overdue=1&page=2")]);
  const ids = pages.flatMap((page) => idsIn(page.html));
  assert.ok(!ids.includes(5), "paid invoice must be excluded");
  assert.ok(!ids.includes(6), "cancelled invoice must be excluded");
  assert.ok(!ids.includes(10), "recently paid invoice must be excluded");
});

test("gate: future-dated invoices are excluded", async () => {
  const { html } = await request("overdue=1");
  assert.ok(!idsIn(html).includes(4));
});

test("gate: leap-day and month-boundary due dates are handled", async () => {
  const pages = await Promise.all([request("overdue=1&page=1"), request("overdue=1&page=2")]);
  const ids = pages.flatMap((page) => idsIn(page.html));
  for (const id of [7, 8, 9]) {
    assert.ok(ids.includes(id), `invoice ${id} should be overdue`);
  }
  for (const id of [3, 4, 5, 6, 46]) {
    assert.ok(!ids.includes(id), `invoice ${id} must not be overdue`);
  }
});

test("gate: overdue combines with the existing status filter", async () => {
  const { html } = await request("overdue=1&status=DRAFT");
  const ids = idsIn(html);
  assert.deepEqual(ids, [2], "only the past-due draft should remain");
});

test("gate: overdue combines with the existing text query", async () => {
  const { html } = await request("overdue=1&q=Northwind");
  assert.deepEqual(idsIn(html), [1], "the future-dated Northwind invoice must be filtered out");
});

test("gate: pagination stays at 25 rows per page", async () => {
  const { html } = await request("overdue=1");
  assert.equal(idsIn(html).length, 25);
  const second = await request("overdue=1&page=2");
  assert.equal(idsIn(second.html).length, OVERDUE_IDS.length - 25);
});

test("gate: omitting the overdue filter still returns every invoice", async () => {
  const { html } = await request("");
  assert.equal(idsIn(html).length, 25);
  assert.ok(html.includes(`of ${FIXTURE.length} invoices`));
});

test("gate: amount formatting is unchanged", async () => {
  const { html } = await request("overdue=1");
  assert.ok(html.includes("$1,234.56"), "expected grouped currency formatting to survive");
});

test("gate: customer names stay HTML-escaped", async () => {
  const pages = await Promise.all([request("overdue=1&page=1"), request("overdue=1&page=2")]);
  const html = pages.map((page) => page.html).join("");
  assert.ok(html.includes("&quot;Prime&quot;"), "quotes must stay escaped");
  assert.ok(!html.includes("<script>"), "raw script tag must never reach the page");
});
