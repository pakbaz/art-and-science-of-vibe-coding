"use strict";

// External acceptance suite. It stays outside experiment workspaces and uses an
// in-memory fixture, so verification never rewrites the application's data.

process.env.INVOICE_AS_OF = "2026-09-18";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const APP_ROOT = process.env.APP_ROOT;
if (!APP_ROOT) throw new Error("APP_ROOT must point to the application workspace");

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

const FIXTURE = [
  invoice(1, "SENT", "2026-09-17", { customer: "Northwind Trading #1", amountCents: 100 }),
  invoice(2, "DRAFT", "2026-01-15", { amountCents: 200 }),
  invoice(3, "SENT", "2026-09-18", { amountCents: 300 }),
  invoice(4, "SENT", "2026-09-19", { customer: "Northwind Trading #4", amountCents: 400 }),
  invoice(5, "PAID", "2026-01-15", { amountCents: 500 }),
  invoice(6, "CANCELLED", "2026-01-15", { amountCents: 600 }),
  invoice(7, "SENT", "2024-02-29", {
    customer: 'Proseware "Prime" <script>alert(1)</script>',
    amountCents: 700,
  }),
  invoice(8, "SENT", "2026-08-31", { amountCents: 800 }),
  invoice(9, "SENT", "2026-09-01", { amountCents: 900 }),
  invoice(10, "PAID", "2026-09-17", { amountCents: 1000 }),
  invoice(46, "DRAFT", "2026-12-01", { amountCents: 4600 }),
  invoice(47, "SENT", "2028-02-29", { amountCents: 4700 }),
];

for (let id = 11; id <= 45; id += 1) {
  FIXTURE.push(invoice(id, "SENT", "2026-05-01", { amountCents: id * 100 }));
}

const EXPECTED_OVERDUE = FIXTURE.filter(
  (row) => row.status === "SENT" && row.dueDate < process.env.INVOICE_AS_OF,
);
const EXPECTED_OVERDUE_TOTAL = EXPECTED_OVERDUE.reduce(
  (total, row) => total + row.amountCents,
  0,
);

const { buildApp } = require(path.join(APP_ROOT, "src", "server.js"));

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(buildApp(FIXTURE));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

function request(query = "") {
  return new Promise((resolve, reject) => {
    http
      .get(`${baseUrl}/invoices${query ? `?${query}` : ""}`, (response) => {
        response.setEncoding("utf8");
        let html = "";
        response.on("data", (chunk) => {
          html += chunk;
        });
        response.on("end", () => resolve({ status: response.statusCode, html }));
      })
      .on("error", reject);
  });
}

function idsIn(html) {
  return [...html.matchAll(/data-invoice-id="(\d+)"/g)].map((match) => Number(match[1]));
}

function hrefsIn(html) {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, "&"));
}

function overdueInputIn(html) {
  return [...html.matchAll(/<input\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => /\bname=["']overdue["']/i.test(tag));
}

function summaryIn(html) {
  const match = html.match(/<p\b[^>]*class=["'][^"']*\bsummary\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  return match ? match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

function currency(cents) {
  const whole = Math.floor(cents / 100).toLocaleString("en-US");
  return `$${whole}.${String(cents % 100).padStart(2, "0")}`;
}

test("HTTP smoke: invoices renders HTML through a real server", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.html, /<!doctype html>/i);
  assert.match(response.html, /<table[^>]*class="invoices"/);
});

test("overdue includes only SENT invoices strictly before the UTC as-of date", async () => {
  const first = await request("overdue=1&page=1");
  const second = await request("overdue=1&page=2");
  assert.deepEqual(
    [...idsIn(first.html), ...idsIn(second.html)],
    EXPECTED_OVERDUE.map((row) => row.id),
  );
});

test("DRAFT, PAID, CANCELLED, due-today, and future invoices are excluded", async () => {
  const pages = await Promise.all([request("overdue=1&page=1"), request("overdue=1&page=2")]);
  const ids = pages.flatMap(({ html }) => idsIn(html));
  for (const id of [2, 3, 4, 5, 6, 10, 46, 47]) {
    assert.ok(!ids.includes(id), `invoice ${id} must not be overdue`);
  }
});

test("valid leap-day and month-boundary dates compare as UTC calendar dates", async () => {
  const pages = await Promise.all([request("overdue=1&page=1"), request("overdue=1&page=2")]);
  const ids = pages.flatMap(({ html }) => idsIn(html));
  for (const id of [7, 8, 9]) assert.ok(ids.includes(id), `invoice ${id} should be overdue`);
});

test("overdue composes with q, status, and customer filters", async () => {
  const q = await request("overdue=1&q=Northwind");
  assert.deepEqual(idsIn(q.html), [1]);

  const status = await request("overdue=1&status=DRAFT");
  assert.deepEqual(idsIn(status.html), []);

  const customer = await request("overdue=1&customer=Proseware");
  assert.deepEqual(idsIn(customer.html), [7]);
});

test("pagination remains 25 rows and preserves every active filter", async () => {
  const response = await request(
    "overdue=1&q=Contoso&status=SENT&customer=Contoso&page=1",
  );
  assert.equal(idsIn(response.html).length, 25);
  const links = hrefsIn(response.html);
  assert.ok(
    links.some((href) => {
      const url = new URL(href, "http://localhost");
      return (
        url.pathname === "/invoices" &&
        url.searchParams.get("page") === "2" &&
        url.searchParams.get("overdue") === "1" &&
        url.searchParams.get("q") === "Contoso" &&
        url.searchParams.get("status") === "SENT" &&
        url.searchParams.get("customer") === "Contoso"
      );
    }),
    "expected a page-2 link preserving q, status, customer, and overdue",
  );
});

test("the form exposes an Overdue only checkbox and preserves checked state", async () => {
  const response = await request("overdue=1&q=Northwind");
  const form = response.html.match(/<form\b[^>]*>/i);
  assert.ok(form, "expected a filter form");
  assert.match(form[0], /\bmethod=["']get["']/i);
  assert.match(form[0], /\baction=["']\/invoices["']/i);
  const checkedInput = overdueInputIn(response.html);
  assert.ok(checkedInput, "expected an overdue checkbox");
  assert.match(checkedInput, /\btype=["']checkbox["']/i);
  assert.match(checkedInput, /\bvalue=["']1["']/i);
  assert.match(checkedInput, /\bchecked(?:\s|>|=)/i);
  assert.match(response.html, /Overdue only/i);

  const unchecked = await request("q=Northwind");
  const checkbox = overdueInputIn(unchecked.html);
  assert.ok(checkbox, "expected an overdue checkbox");
  assert.doesNotMatch(checkbox, /\bchecked(?:\s|>|=)/i);
});

test("summary count and total cover all matching pages", async () => {
  const response = await request("overdue=1");
  const summary = summaryIn(response.html);
  assert.ok(summary, "expected a summary element");
  assert.match(summary, new RegExp(`\\b${EXPECTED_OVERDUE.length}\\b`));
  assert.ok(
    summary.includes(currency(EXPECTED_OVERDUE_TOTAL)),
    `expected all-page outstanding total ${currency(EXPECTED_OVERDUE_TOTAL)}`,
  );
});

test("an invalid INVOICE_AS_OF value falls back to today's UTC date", async () => {
  const probe = `
    const path = require("node:path");
    const appRoot = process.env.APP_ROOT;
    const today = new Date().toISOString().slice(0, 10);
    const shift = (days) => {
      const value = new Date(today + "T00:00:00Z");
      value.setUTCDate(value.getUTCDate() + days);
      return value.toISOString().slice(0, 10);
    };
    const rows = [
      { id: 501, number: "INV-0000501", customer: "Contoso", status: "SENT", amountCents: 100, issuedAt: shift(-30), dueDate: shift(-1) },
      { id: 502, number: "INV-0000502", customer: "Contoso", status: "SENT", amountCents: 100, issuedAt: shift(-30), dueDate: today },
      { id: 503, number: "INV-0000503", customer: "Contoso", status: "SENT", amountCents: 100, issuedAt: shift(-30), dueDate: shift(1) },
      { id: 504, number: "INV-0000504", customer: "Contoso", status: "DRAFT", amountCents: 100, issuedAt: shift(-30), dueDate: shift(-1) }
    ];
    const { buildApp } = require(path.join(appRoot, "src", "server.js"));
    const handler = buildApp(rows);
    handler(
      { url: "/invoices?overdue=1", method: "GET" },
      {
        writeHead() {},
        end(html) {
          const ids = [...String(html).matchAll(/data-invoice-id="(\\d+)"/g)].map((match) => Number(match[1]));
          process.stdout.write(JSON.stringify(ids));
        }
      }
    );
  `;
  const result = spawnSync(process.execPath, ["-e", probe], {
    cwd: APP_ROOT,
    env: { ...process.env, APP_ROOT, INVOICE_AS_OF: "not-a-date" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [501]);
});

test("unfiltered behavior, amount formatting, and escaping remain intact", async () => {
  const response = await request();
  assert.equal(idsIn(response.html).length, 25);
  assert.match(response.html, new RegExp(`\\b${FIXTURE.length}\\b`));
  assert.ok(response.html.includes("$1.00"));

  const escaped = await request("overdue=1&customer=Proseware");
  assert.ok(escaped.html.includes("&quot;Prime&quot;"));
  assert.ok(!escaped.html.includes("<script>"));
});
