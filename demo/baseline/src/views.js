"use strict";

const { formatAmount, formatDate, escapeHtml } = require("./format");
const { STATUSES } = require("../data/generate");

function renderFilters(query) {
  const statusOptions = ["", ...STATUSES]
    .map((status) => {
      const selected = (query.status || "") === status ? " selected" : "";
      const label = status === "" ? "All statuses" : status;
      return `<option value="${escapeHtml(status)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join("");

  return `<form method="get" action="/invoices" class="filters">
      <input type="search" name="q" value="${escapeHtml(query.q || "")}" placeholder="Number or customer">
      <select name="status">${statusOptions}</select>
      <input type="text" name="customer" value="${escapeHtml(query.customer || "")}" placeholder="Customer">
      <button type="submit">Apply</button>
    </form>`;
}

function renderRow(invoice) {
  return `<tr data-invoice-id="${invoice.id}">
      <td class="number">${escapeHtml(invoice.number)}</td>
      <td class="customer">${escapeHtml(invoice.customer)}</td>
      <td class="status">${escapeHtml(invoice.status)}</td>
      <td class="amount">${escapeHtml(formatAmount(invoice.amountCents))}</td>
      <td class="issued">${escapeHtml(formatDate(invoice.issuedAt))}</td>
      <td class="due">${escapeHtml(formatDate(invoice.dueDate))}</td>
    </tr>`;
}

function renderPage(result, query) {
  const rows = result.rows.map(renderRow).join("\n");
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Invoices</title></head>
<body>
  <h1>Invoices</h1>
  ${renderFilters(query)}
  <p class="summary">Showing ${result.rows.length} of ${result.totalRows} invoices</p>
  <table class="invoices">
    <thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Amount</th><th>Issued</th><th>Due</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <nav class="pagination">Page ${result.page} of ${result.totalPages}</nav>
</body>
</html>`;
}

module.exports = { renderPage, renderRow, renderFilters };
