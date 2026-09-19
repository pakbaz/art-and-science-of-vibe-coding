"use strict";

const http = require("node:http");
const { loadInvoices } = require("../data/store");
const { listInvoices } = require("./invoices");
const { renderPage } = require("./views");

const PORT = Number(process.env.PORT || 3000);

function buildApp(invoices) {
  return function handler(request, response) {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== "/invoices") {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found");
      return;
    }
    const query = Object.fromEntries(url.searchParams.entries());
    const result = listInvoices(invoices, query);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(renderPage(result, query));
  };
}

function start() {
  const invoices = loadInvoices();
  const server = http.createServer(buildApp(invoices));
  server.listen(PORT, () => {
    process.stdout.write(`invoice-admin listening on ${PORT} with ${invoices.length} invoices\n`);
  });
  return server;
}

if (require.main === module) {
  start();
}

module.exports = { buildApp, start };
