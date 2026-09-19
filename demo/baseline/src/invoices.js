"use strict";

const PAGE_SIZE = 25;

// Filters applied on the invoice list. Keep these composable: the admin console
// relies on combining a text query with a status and a customer filter.
function applyFilters(invoices, query) {
  let rows = invoices;

  if (query.q) {
    const needle = String(query.q).toLowerCase();
    rows = rows.filter(
      (invoice) =>
        invoice.number.toLowerCase().includes(needle) ||
        invoice.customer.toLowerCase().includes(needle),
    );
  }

  if (query.status) {
    const wanted = String(query.status).toUpperCase();
    rows = rows.filter((invoice) => invoice.status === wanted);
  }

  if (query.customer) {
    const needle = String(query.customer).toLowerCase();
    rows = rows.filter((invoice) => invoice.customer.toLowerCase().includes(needle));
  }

  return rows;
}

function paginate(rows, page) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (current - 1) * PAGE_SIZE;
  return {
    rows: rows.slice(start, start + PAGE_SIZE),
    page: current,
    totalPages,
    totalRows: rows.length,
  };
}

function listInvoices(invoices, query = {}) {
  return paginate(applyFilters(invoices, query), query.page);
}

module.exports = { listInvoices, applyFilters, paginate, PAGE_SIZE };
