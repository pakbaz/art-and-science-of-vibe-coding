"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const DEMO_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DEMO_ROOT, "..");
const TEST_RUNS_ROOT = path.join(DEMO_ROOT, ".test-runs");
const RUNNER = path.join(DEMO_ROOT, "run.js");

let sandbox;

function cli(args, options = {}) {
  const env = {
    ...process.env,
    DEMO_RUNS_ROOT: sandbox,
    INVOICE_COUNT: "17",
    INVOICE_FIXTURE: "data/fixture-100.json",
    INVOICE_FAST: "1",
    ...options.env,
  };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: REPO_ROOT,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!options.allowFailure && result.status !== 0) {
    assert.fail(
      `runner failed (${result.status}): node demo/run.js ${args.join(" ")}\n` +
        `${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

function cliAsync(args) {
  const env = { ...process.env, DEMO_RUNS_ROOT: sandbox };
  delete env.NODE_TEST_CONTEXT;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER, ...args], { cwd: REPO_ROOT, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function readState(statePath) {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeReferenceImplementation(workspace) {
  fs.writeFileSync(
    path.join(workspace, "src", "invoices.js"),
    `"use strict";

const PAGE_SIZE = 25;

function asOfDate(value = process.env.INVOICE_AS_OF) {
  return /^\\d{4}-\\d{2}-\\d{2}$/.test(value || "")
    ? value
    : new Date().toISOString().slice(0, 10);
}

function applyFilters(invoices, query) {
  let rows = invoices;
  if (query.q) {
    const needle = String(query.q).toLowerCase();
    rows = rows.filter((invoice) =>
      invoice.number.toLowerCase().includes(needle) ||
      invoice.customer.toLowerCase().includes(needle));
  }
  if (query.status) {
    const wanted = String(query.status).toUpperCase();
    rows = rows.filter((invoice) => invoice.status === wanted);
  }
  if (query.customer) {
    const needle = String(query.customer).toLowerCase();
    rows = rows.filter((invoice) => invoice.customer.toLowerCase().includes(needle));
  }
  if (query.overdue === "1") {
    const asOf = asOfDate();
    rows = rows.filter((invoice) => invoice.status === "SENT" && invoice.dueDate < asOf);
  }
  return rows;
}

function paginate(rows, page) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (current - 1) * PAGE_SIZE;
  return { rows: rows.slice(start, start + PAGE_SIZE), page: current, totalPages, totalRows: rows.length };
}

function listInvoices(invoices, query = {}) {
  const filtered = applyFilters(invoices, query);
  return {
    ...paginate(filtered, query.page),
    totalOutstandingCents: filtered.reduce((sum, invoice) => sum + invoice.amountCents, 0),
  };
}

module.exports = { listInvoices, applyFilters, paginate, asOfDate, PAGE_SIZE };
`,
  );

  fs.writeFileSync(
    path.join(workspace, "src", "views.js"),
    `"use strict";

const { formatAmount, formatDate, escapeHtml } = require("./format");
const { STATUSES } = require("../data/generate");

function renderFilters(query) {
  const statusOptions = ["", ...STATUSES].map((status) => {
    const selected = (query.status || "") === status ? " selected" : "";
    const label = status === "" ? "All statuses" : status;
    return \`<option value="\${escapeHtml(status)}"\${selected}>\${escapeHtml(label)}</option>\`;
  }).join("");
  const checked = query.overdue === "1" ? " checked" : "";
  return \`<form method="get" action="/invoices" class="filters">
      <input type="search" name="q" value="\${escapeHtml(query.q || "")}" placeholder="Number or customer">
      <select name="status">\${statusOptions}</select>
      <input type="text" name="customer" value="\${escapeHtml(query.customer || "")}" placeholder="Customer">
      <label><input type="checkbox" name="overdue" value="1"\${checked}> Overdue only</label>
      <button type="submit">Apply</button>
    </form>\`;
}

function renderRow(invoice) {
  return \`<tr data-invoice-id="\${invoice.id}">
      <td class="number">\${escapeHtml(invoice.number)}</td>
      <td class="customer">\${escapeHtml(invoice.customer)}</td>
      <td class="status">\${escapeHtml(invoice.status)}</td>
      <td class="amount">\${escapeHtml(formatAmount(invoice.amountCents))}</td>
      <td class="issued">\${escapeHtml(formatDate(invoice.issuedAt))}</td>
      <td class="due">\${escapeHtml(formatDate(invoice.dueDate))}</td>
    </tr>\`;
}

function pageHref(query, page) {
  const params = new URLSearchParams();
  for (const key of ["q", "status", "customer", "overdue"]) {
    if (query[key]) params.set(key, query[key]);
  }
  params.set("page", String(page));
  return \`/invoices?\${escapeHtml(params.toString())}\`;
}

function renderPagination(result, query) {
  const links = [];
  if (result.page > 1) links.push(\`<a href="\${pageHref(query, result.page - 1)}">Previous</a>\`);
  if (result.page < result.totalPages) links.push(\`<a href="\${pageHref(query, result.page + 1)}">Next</a>\`);
  return \`<nav class="pagination">\${links.join(" ")} Page \${result.page} of \${result.totalPages}</nav>\`;
}

function renderPage(result, query) {
  const rows = result.rows.map(renderRow).join("\\n");
  return \`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Invoices</title></head>
<body>
  <h1>Invoices</h1>
  \${renderFilters(query)}
  <p class="summary">Showing \${result.rows.length} of \${result.totalRows} matching invoices · \${escapeHtml(formatAmount(result.totalOutstandingCents))} outstanding</p>
  <table class="invoices">
    <thead><tr><th>Number</th><th>Customer</th><th>Status</th><th>Amount</th><th>Issued</th><th>Due</th></tr></thead>
    <tbody>\${rows}</tbody>
  </table>
  \${renderPagination(result, query)}
</body>
</html>\`;
}

module.exports = { renderPage, renderRow, renderFilters, renderPagination };
`,
  );
}

test.before(() => {
  fs.mkdirSync(TEST_RUNS_ROOT, { recursive: true });
  sandbox = fs.mkdtempSync(path.join(TEST_RUNS_ROOT, "runner-"));
});

test.after(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

test("help is short and invalid commands fail clearly", () => {
  const help = cli(["help"]);
  assert.match(help.stdout, /prepare/);
  assert.match(help.stdout, /never launches an agent/);
  assert.ok(help.stdout.split("\n").length < 25);

  const invalid = cli(["unknown", "--trial", "missing"], { allowFailure: true });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /state file not found/);
});

test("existing-project preparation keeps nested lane worktrees in the same repository", () => {
  const project = path.join(sandbox, "existing-project");
  const coordinator = path.join(sandbox, "coordinator");
  const git = (cwd, args) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  fs.mkdirSync(path.join(project, "demo"), { recursive: true });
  for (const entry of ["run.js", "baseline", "prep", "gate", "FEATURE-REQUEST.md"]) {
    fs.cpSync(path.join(DEMO_ROOT, entry), path.join(project, "demo", entry), {
      recursive: true,
      filter: (source) => path.basename(source) !== "invoices.json",
    });
  }
  fs.writeFileSync(path.join(project, "presentation.txt"), "Keep this presentation.\n");
  git(project, ["init", "--quiet"]);
  git(project, ["config", "user.name", "Demo Test"]);
  git(project, ["config", "user.email", "demo-test@invalid.local"]);
  git(project, ["add", "."]);
  git(project, [
    "commit", "--quiet", "-m", "Fixture project",
    "-m", "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>",
  ]);
  const originalHead = git(project, ["rev-parse", "HEAD"]);
  git(project, ["worktree", "add", "--quiet", "--detach", coordinator, originalHead]);
  fs.writeFileSync(path.join(coordinator, "presentation.txt"), "Staged presenter edits.\n");
  git(coordinator, ["add", "presentation.txt"]);
  fs.appendFileSync(path.join(coordinator, "presentation.txt"), "Unstaged presenter edits.\n");
  fs.writeFileSync(path.join(coordinator, "untracked.txt"), "Keep this untracked file.\n");
  const originalStatus = git(coordinator, ["status", "--porcelain"]);
  const originalIndex = fs.readFileSync(path.resolve(
    coordinator, git(coordinator, ["rev-parse", "--git-path", "index"]),
  ));
  const originalProjectIndex = fs.readFileSync(path.join(project, ".git", "index"));
  const originalContent = fs.readFileSync(path.join(coordinator, "presentation.txt"));
  const invoke = (args, allowFailure = false, checkout = coordinator) => {
    const env = { ...process.env, DEMO_RUNS_ROOT: path.join(sandbox, "existing-trials") };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [path.join(checkout, "demo", "run.js"), ...args], {
      cwd: checkout, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    });
    if (!allowFailure) assert.equal(result.status, 0, result.stderr);
    return result;
  };
  const info = JSON.parse(invoke([
    "prepare", "--existing-project", "--parallel", "--id", "nested", "--json",
  ]).stdout);
  assert.equal(info.sourceMode, "existing-project");
  assert.equal(info.sourceRepo, coordinator);
  assert.equal(info.baseBranch, "demo-baseline/nested");
  assert.equal(git(project, ["rev-parse", info.baseBranch]), info.baseCommit);
  assert.equal(git(project, ["rev-list", "--count", info.baseCommit]), "1");
  assert.match(git(project, ["log", "-1", "--format=%B", info.baseCommit]), /Co-authored-by: Copilot App/);
  const paths = git(project, ["ls-tree", "-r", "--name-only", info.baseCommit]).split("\n");
  assert.ok(paths.includes("FEATURE-REQUEST.md") && paths.includes("src/server.js"));
  assert.ok(!paths.some((file) => /^(demo\/|deck\/|AGENTS\.md$|presentation\.txt$)/.test(file)));
  assert.equal(fs.existsSync(path.join(path.dirname(info.statePath), "source", ".git")), false);
  assert.equal(fs.existsSync(path.join(path.dirname(info.statePath), "baseline.index")), false);
  assert.equal(git(coordinator, ["rev-parse", "HEAD"]), originalHead);
  assert.equal(git(project, ["rev-parse", "HEAD"]), originalHead);
  assert.deepEqual(fs.readFileSync(path.resolve(
    coordinator, git(coordinator, ["rev-parse", "--git-path", "index"]),
  )), originalIndex);
  assert.deepEqual(fs.readFileSync(path.join(coordinator, "presentation.txt")), originalContent);
  assert.equal(git(coordinator, ["status", "--porcelain"]), originalStatus);
  const duplicate = invoke(["prepare", "--existing-project", "--id", "nested"], true);
  assert.notEqual(duplicate.status, 0);
  assert.equal(git(project, ["rev-parse", info.baseBranch]), info.baseCommit);
  git(project, ["branch", "demo-baseline/collision", originalHead]);
  const collision = invoke(["prepare", "--existing-project", "--id", "collision"], true);
  assert.notEqual(collision.status, 0);
  assert.match(collision.stderr, /baseline branch already exists/);
  assert.equal(git(project, ["rev-parse", "demo-baseline/collision"]), originalHead);

  const wrong = path.join(sandbox, "wrong-project-base");
  git(project, ["worktree", "add", "--quiet", "--detach", wrong, originalHead]);
  const rejected = invoke(["attach", "A", wrong, "--session", "wrong", "--trial", info.trialId], true);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /does not match trial base/);
  const laneA = path.join(sandbox, "nested-A");
  const laneB = path.join(sandbox, "nested-B");
  for (const [lane, workspace] of [["A", laneA], ["B", laneB]]) {
    git(project, ["worktree", "add", "--quiet", "-b", `run-${lane}`, workspace, info.baseBranch]);
    invoke(["attach", lane, workspace, "--session", `nested-${lane}`, "--trial", info.trialId]);
  }
  const attached = readState(info.statePath);
  for (const lane of ["A", "B"]) {
    assert.equal(attached.lanes[lane].baseProof.commonGitDir, path.join(project, ".git"));
    assert.equal(attached.lanes[lane].baseProof.head, info.baseCommit);
  }
  assert.equal(fs.existsSync(path.join(laneA, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(laneB, "AGENTS.md")), true);
  for (const lane of ["B", "A"]) invoke(["start", lane, "--trial", info.trialId]);
  for (const [lane, workspace] of [["A", laneA], ["B", laneB]]) {
    const red = JSON.parse(invoke(["check", lane, "--trial", info.trialId, "--json"], true).stdout);
    assert.equal(red.attempt.full.exitCode, 0);
    assert.equal(red.attempt.fullDatasetCount, 400000);
    assert.equal(red.attempt.acceptance.exitCode, 1);
    writeReferenceImplementation(workspace);
    const green = JSON.parse(invoke(["check", lane, "--trial", info.trialId, "--json"]).stdout);
    assert.equal(green.attempt.passed, true);
    assert.equal(green.attempt.data.acceptancePreservedData, true);
  }
  const report = JSON.parse(invoke(["compare", "--trial", info.trialId, "--json"]).stdout);
  assert.equal(report.A.status, "passed");
  assert.equal(report.B.status, "passed");

  const primaryInfo = JSON.parse(invoke([
    "prepare", "--existing-project", "--id", "primary-cli", "--json",
  ], false, project).stdout);
  assert.equal(primaryInfo.sourceRepo, project);
  assert.equal(primaryInfo.executionMode, "sequential");
  const cliTrees = JSON.parse(invoke([
    "worktrees", "--trial", primaryInfo.trialId, "--json",
  ], false, project).stdout);
  assert.equal(cliTrees.created.length, 2);
  for (const lane of cliTrees.created) {
    assert.equal(lane.commonGitDir, path.join(project, ".git"));
    assert.equal(lane.baseCommit, primaryInfo.baseCommit);
  }
  assert.deepEqual(fs.readFileSync(path.join(project, ".git", "index")), originalProjectIndex);
  assert.equal(git(coordinator, ["status", "--porcelain"]), originalStatus);
});

test("end-to-end runner preserves honest state, gate output, and nullable metrics", async (t) => {
  const prepared = cli(["prepare", "--id", "trial-one", "--json"]);
  const info = JSON.parse(prepared.stdout);
  assert.equal(path.isAbsolute(info.sourceRepo), true);
  assert.equal(path.isAbsolute(info.statePath), true);
  assert.equal(fs.existsSync(path.join(info.sourceRepo, "FEATURE-REQUEST.md")), true);
  assert.equal(fs.existsSync(path.join(info.sourceRepo, "README.md")), true);
  assert.equal(
    fs.readFileSync(path.join(info.sourceRepo, "FEATURE-REQUEST.md"), "utf8"),
    fs.readFileSync(path.join(DEMO_ROOT, "FEATURE-REQUEST.md"), "utf8"),
  );
  for (const forbidden of ["gate", "prep", "results", "deck", "A", "B", "AGENTS.md"]) {
    assert.equal(fs.existsSync(path.join(info.sourceRepo, forbidden)), false, forbidden);
  }
  assert.equal(
    spawnSync("git", ["rev-list", "--count", "HEAD"], {
      cwd: info.sourceRepo,
      encoding: "utf8",
    }).stdout.trim(),
    "1",
  );
  assert.match(
    spawnSync("git", ["log", "-1", "--format=%B"], {
      cwd: info.sourceRepo,
      encoding: "utf8",
    }).stdout,
    /Co-authored-by: Copilot App <223556219\+Copilot@users\.noreply\.github\.com>/,
  );
  const preparedState = readState(info.statePath);
  assert.equal(preparedState.trusted.fullInvoiceCount, 400000);
  assert.equal(preparedState.trusted.fullTestScript, "npm run seed && node --test --test-reporter=tap test/");
  assert.ok(preparedState.trusted.regressionFiles["test/existing.test.js"]);
  assert.ok(preparedState.trusted.generatorHash);
  assert.ok(preparedState.trusted.storeHashes.A);
  assert.ok(preparedState.trusted.storeHashes.B);

  const duplicate = cli(["prepare", "--id", "trial-one"], { allowFailure: true });
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /refusing to overwrite/);

  const malformedState = path.join(sandbox, "malformed-state.json");
  fs.writeFileSync(malformedState, "{not json");
  const malformed = cli(["compare", "--state", malformedState], { allowFailure: true });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /cannot parse state file/);

  const sourceAttach = cli(
    ["attach", "A", info.sourceRepo, "--session", "bad", "--trial", "trial-one"],
    { allowFailure: true },
  );
  assert.notEqual(sourceAttach.status, 0);
  assert.match(sourceAttach.stderr, /source repository/);

  const symlink = path.join(sandbox, "source-link");
  fs.symlinkSync(info.sourceRepo, symlink, "dir");
  const symlinkAttach = cli(
    ["attach", "A", symlink, "--session", "bad", "--trial", "trial-one"],
    { allowFailure: true },
  );
  assert.notEqual(symlinkAttach.status, 0);
  assert.match(symlinkAttach.stderr, /symlinked path/);

  const dirtyWorktree = path.join(sandbox, "dirty-worktree");
  const addDirty = spawnSync(
    "git",
    ["worktree", "add", "--quiet", "--detach", dirtyWorktree, info.baseCommit],
    { cwd: info.sourceRepo, encoding: "utf8" },
  );
  assert.equal(addDirty.status, 0, `${addDirty.stdout}\n${addDirty.stderr}`);
  fs.writeFileSync(path.join(dirtyWorktree, "dirty.txt"), "dirty\n");
  const dirtyAttach = cli(
    ["attach", "A", dirtyWorktree, "--session", "bad", "--trial", "trial-one"],
    { allowFailure: true },
  );
  assert.notEqual(dirtyAttach.status, 0);
  assert.match(dirtyAttach.stderr, /must be pristine/);
  const removeDirty = spawnSync("git", ["worktree", "remove", "--force", dirtyWorktree], {
    cwd: info.sourceRepo,
    encoding: "utf8",
  });

  await t.test("parallel mode permits either lane first and retains simultaneous starts", async () => {
    const info = JSON.parse(cli(["prepare", "--id", "parallel-start", "--parallel", "--json"]).stdout);
    cli(["worktrees", "--trial", info.trialId]);
    const initial = readState(info.statePath);
    for (const lane of ["A", "B"]) {
      assert.match(initial.lanes[lane].sessionId, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
    }
    assert.notEqual(initial.lanes.A.sessionId, initial.lanes.B.sessionId);
    const results = await Promise.all(["B", "A"].map((lane) =>
      cliAsync(["start", lane, "--trial", info.trialId, "--json"]),
    ));
    for (const result of results) assert.equal(result.status, 0, result.stderr);
    const state = readState(info.statePath);
    assert.equal(state.executionMode, "parallel");
    assert.equal(state.lanes.A.status, "running");
    assert.equal(state.lanes.B.status, "running");
    assert.equal(state.events.filter((event) => event.type === "started").length, 2);
    const report = JSON.parse(cli(["compare", "--trial", info.trialId, "--json"]).stdout);
    assert.equal(report.executionMode, "parallel");
    assert.match(report.resourceContention, /share.*CPU|shared.*resources/i);
  });

  await t.test("concurrent checks preserve both lane histories and full datasets", async () => {
    const info = JSON.parse(cli(["prepare", "--id", "parallel-check", "--json"]).stdout);
    cli(["worktrees", "--trial", info.trialId]);
    const state = readState(info.statePath);
    state.executionMode = "parallel";
    for (const lane of ["A", "B"]) {
      state.lanes[lane].status = "running";
      state.lanes[lane].startedAt = new Date().toISOString();
      const marker = path.join(sandbox, `check-${lane}.ready`);
      const other = path.join(sandbox, `check-${lane === "A" ? "B" : "A"}.ready`);
      fs.writeFileSync(path.join(state.lanes[lane].workspace, "test", "barrier.test.js"), `
  const test = require("node:test");
  const fs = require("node:fs");
  test("both full suites execute concurrently", async () => {
    fs.writeFileSync(${JSON.stringify(marker)}, "ready");
    const deadline = Date.now() + 10000;
    while (!fs.existsSync(${JSON.stringify(other)})) {
      if (Date.now() > deadline) throw new Error("the other lane did not reach its full suite");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  });
  `);
    }
    fs.writeFileSync(info.statePath, JSON.stringify(state));
    const results = await Promise.all(["A", "B"].map((lane) =>
      cliAsync(["check", lane, "--trial", info.trialId, "--json"]),
    ));
    for (const result of results) {
      assert.equal(result.status, 1, result.stderr);
      const checked = JSON.parse(result.stdout);
      assert.equal(checked.attempt.full.exitCode, 0, checked.fullOutput);
      assert.equal(checked.attempt.fullDatasetCount, 400000);
      assert.equal(checked.attempt.acceptance.exitCode, 1);
    }
    const saved = readState(info.statePath);
    for (const lane of ["A", "B"]) {
      assert.equal(saved.lanes[lane].attempts.length, 1, `lost ${lane}'s attempt`);
      assert.equal(saved.lanes[lane].attempts[0].data.acceptancePreservedData, true);
    }
    assert.equal(saved.events.filter((event) => event.type === "checked").length, 2);
    for (const lane of ["A", "B"]) {
      writeReferenceImplementation(saved.lanes[lane].workspace);
      fs.unlinkSync(path.join(sandbox, `check-${lane}.ready`));
    }
    const passing = await Promise.all(["A", "B"].map((lane) =>
      cliAsync(["check", lane, "--trial", info.trialId, "--json"]),
    ));
    for (const result of passing) {
      assert.equal(result.status, 0, result.stderr);
      const checked = JSON.parse(result.stdout);
      assert.equal(checked.attempt.fullDatasetCount, 400000);
      assert.equal(checked.attempt.acceptance.exitCode, 0);
    }
    const completed = readState(info.statePath);
    for (const lane of ["A", "B"]) {
      assert.equal(completed.lanes[lane].status, "passed");
      assert.equal(completed.lanes[lane].attempts.length, 2);
      assert.ok(completed.lanes[lane].stoppedAt);
    }
    assert.equal(completed.events.filter((event) => event.type === "checked").length, 4);
  });

  await t.test("same-lane lock rejects overlapping commands without changing state", () => {
    const info = JSON.parse(cli(["prepare", "--id", "lane-lock", "--json"]).stdout);
    cli(["worktrees", "--trial", info.trialId]);
    const before = fs.readFileSync(info.statePath, "utf8");
    const lock = `${info.statePath}.A.lock`;
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }));
    try {
      const result = cli(["start", "A", "--trial", info.trialId], { allowFailure: true });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /lock|another command/i);
      assert.equal(fs.readFileSync(info.statePath, "utf8"), before);
    } finally {
      fs.unlinkSync(lock);
    }
    cli(["start", "A", "--trial", info.trialId]);
  });

  await t.test("copilot launching pins settings, resumes identity, and reports failures honestly", () => {
    const info = JSON.parse(cli(["prepare", "--id", "cli-launch", "--parallel", "--json"]).stdout);
    cli(["worktrees", "--trial", info.trialId]);
    const state = readState(info.statePath);
    const bin = path.join(sandbox, "bin");
    const calls = path.join(sandbox, "copilot-calls.jsonl");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "copilot"), `#!/usr/bin/env node
  const fs = require("node:fs");
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("--prompt --session-id --model --reasoning-effort --context --allow-all --no-ask-user --usage-output-file");
    process.exit(0);
  }
  fs.appendFileSync(process.env.TEST_COPILOT_CALLS, JSON.stringify(args) + "\\n");
  process.exit(Number(process.env.TEST_COPILOT_EXIT || 0));
  `, { mode: 0o755 });
    const env = { PATH: `${bin}${path.delimiter}${process.env.PATH}`, TEST_COPILOT_CALLS: calls };
    const mixedOutput = cli(["start", "A", "--trial", info.trialId, "--copilot", "--json"], {
      env, allowFailure: true,
    });
    assert.notEqual(mixedOutput.status, 0);
    assert.match(mixedOutput.stderr, /cannot be combined/);
    assert.equal(readState(info.statePath).lanes.A.status, "ready");
    assert.equal(fs.existsSync(calls), false);
    const result = cli(["start", "A", "--trial", info.trialId, "--copilot"], { env });
    assert.equal(result.status, 0);
    let invocations = fs.readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse);
    const args = invocations[0];
    const value = (flag) => args[args.indexOf(flag) + 1];
    assert.equal(value("--session-id"), state.lanes.A.sessionId);
    assert.equal(value("-C"), state.lanes.A.workspace);
    assert.equal(value("--prompt"), state.prompt);
    assert.equal(value("--model"), "gpt-5.6-sol");
    assert.equal(value("--reasoning-effort"), "high");
    assert.equal(value("--context"), "long_context");
    assert.ok(args.includes("--allow-all"));
    assert.ok(args.includes("--no-ask-user"));
    assert.ok(!args.includes("--interactive"));
    assert.ok(value("--usage-output-file").startsWith(path.dirname(info.statePath) + path.sep));
    assert.equal(readState(info.statePath).lanes.A.status, "running");
    assert.equal(readState(info.statePath).lanes.A.attempts.length, 0);

    const earlyFeedback = cli(["feedback", "A", "--trial", info.trialId, "--copilot"], { env, allowFailure: true });
    assert.notEqual(earlyFeedback.status, 0);
    assert.equal(fs.readFileSync(calls, "utf8").trim().split("\n").length, 1);
    const startTime = readState(info.statePath).lanes.A.startedAt;
    cli(["resume", "A", "--trial", info.trialId, "--copilot"], { env });
    invocations = fs.readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(invocations[1][invocations[1].indexOf("--session-id") + 1], state.lanes.A.sessionId);
    assert.match(invocations[1][invocations[1].indexOf("--prompt") + 1], /^Continue/);
    assert.notEqual(invocations[1][invocations[1].indexOf("--usage-output-file") + 1], value("--usage-output-file"));
    assert.equal(readState(info.statePath).lanes.A.startedAt, startTime);

    const failure = cli(["start", "B", "--trial", info.trialId, "--copilot"], {
      env: { ...env, TEST_COPILOT_EXIT: "7" }, allowFailure: true,
    });
    assert.equal(failure.status, 7);
    assert.match(failure.stderr, /Copilot.*7/);
    assert.equal(readState(info.statePath).lanes.B.status, "running");
    assert.equal(readState(info.statePath).lanes.B.stoppedAt, null);
  });
  assert.equal(removeDirty.status, 0, `${removeDirty.stdout}\n${removeDirty.stderr}`);

  const duplicatePrepared = JSON.parse(
    cli(["prepare", "--id", "duplicate-session", "--json"]).stdout,
  );
  const duplicateA = path.join(sandbox, "duplicate-A");
  const duplicateB = path.join(sandbox, "duplicate-B");
  for (const workspace of [duplicateA, duplicateB]) {
    const added = spawnSync(
      "git",
      ["worktree", "add", "--quiet", "--detach", workspace, duplicatePrepared.baseCommit],
      { cwd: duplicatePrepared.sourceRepo, encoding: "utf8" },
    );
    assert.equal(added.status, 0, `${added.stdout}\n${added.stderr}`);
  }
  cli([
    "attach",
    "A",
    duplicateA,
    "--session",
    "duplicate-session-id",
    "--trial",
    "duplicate-session",
  ]);
  const duplicateSession = cli(
    [
      "attach",
      "B",
      duplicateB,
      "--session",
      "duplicate-session-id",
      "--trial",
      "duplicate-session",
    ],
    { allowFailure: true },
  );
  assert.notEqual(duplicateSession.status, 0);
  assert.match(duplicateSession.stderr, /session id.*already attached/i);

  const worktrees = JSON.parse(
    cli(["worktrees", "--trial", "trial-one", "--json"]).stdout,
  );
  assert.equal(worktrees.created.length, 2);
  const stateAfterAttach = readState(info.statePath);
  const workspaceA = stateAfterAttach.lanes.A.workspace;
  const workspaceB = stateAfterAttach.lanes.B.workspace;
  assert.notEqual(workspaceA, workspaceB);
  assert.equal(stateAfterAttach.lanes.A.baseProof.head, info.baseCommit);
  assert.equal(stateAfterAttach.lanes.B.baseProof.head, info.baseCommit);
  assert.equal(
    stateAfterAttach.lanes.A.baseProof.commonGitDir,
    stateAfterAttach.lanes.B.baseProof.commonGitDir,
  );
  assert.equal(fs.existsSync(path.join(workspaceA, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(workspaceB, "AGENTS.md")), true);
  assert.equal(
    spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: workspaceA,
      encoding: "utf8",
    }).stdout,
    "",
  );
  const bChangedPaths = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: workspaceB, encoding: "utf8" },
  ).stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3))
    .sort();
  assert.deepEqual(bChangedPaths, [
    "AGENTS.md",
    "data/fixture-100.json",
    "data/store.js",
    "package.json",
  ]);

  const repeatWorktrees = JSON.parse(
    cli(["worktrees", "--trial", "trial-one", "--json"]).stdout,
  );
  assert.equal(repeatWorktrees.created.length, 0);
  assert.equal(repeatWorktrees.alreadyAttached, 2);

  const bFirst = cli(["start", "B", "--trial", "trial-one"], { allowFailure: true });
  assert.notEqual(bFirst.status, 0);
  assert.match(bFirst.stderr, /finish lane A/);

  await t.test("deleted worktrees cannot start a new timer", () => {
    const prepared = JSON.parse(cli(["prepare", "--id", "deleted-worktree", "--parallel", "--json"]).stdout);
    cli(["worktrees", "--trial", prepared.trialId]);
    const state = readState(prepared.statePath);
    const removed = spawnSync("git", ["worktree", "remove", state.lanes.A.workspace], {
      cwd: prepared.sourceRepo, encoding: "utf8",
    });
    assert.equal(removed.status, 0, removed.stderr);
    const result = cli(["start", "A", "--trial", prepared.trialId], { allowFailure: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /workspace.*does not exist/);
    const saved = readState(prepared.statePath);
    assert.equal(saved.lanes.A.status, "ready");
    assert.equal(saved.lanes.A.startedAt, null);
    cli(["start", "B", "--trial", prepared.trialId]);
    const removedB = spawnSync("git", ["worktree", "remove", "--force", state.lanes.B.workspace], {
      cwd: prepared.sourceRepo, encoding: "utf8",
    });
    assert.equal(removedB.status, 0, removedB.stderr);
    const checked = cli(["check", "B", "--trial", prepared.trialId], { allowFailure: true });
    assert.notEqual(checked.status, 0);
    assert.match(checked.stderr, /workspace.*does not exist/);
    assert.equal(readState(prepared.statePath).lanes.B.attempts.length, 0);
  });

  await t.test("B prep fast command runs the repository suite", () => {
    const result = spawnSync("npm", ["run", "test:fast"], {
      cwd: workspaceB,
      env: { ...process.env, INVOICE_AS_OF: "2026-09-18" },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });

  const startedA = JSON.parse(cli(["start", "A", "--trial", "trial-one", "--json"]).stdout);
  assert.equal(
    startedA.prompt,
    "Add the overdue-invoices feature in FEATURE-REQUEST.md. Make it work and check it.\n" +
      "Work only in this repository.",
  );

  const parallelStart = cli(["start", "B", "--trial", "trial-one"], { allowFailure: true });
  assert.notEqual(parallelStart.status, 0);
  assert.match(parallelStart.stderr, /lane A is still running|finish lane A/);

  const packageA = JSON.parse(fs.readFileSync(path.join(workspaceA, "package.json"), "utf8"));
  packageA.scripts.test = "node --test --test-reporter=tap test/";
  packageA.scripts.pretest = "echo bypass";
  packageA.scripts.preseed = "echo shrink";
  fs.writeFileSync(path.join(workspaceA, "package.json"), `${JSON.stringify(packageA, null, 2)}\n`);
  fs.appendFileSync(path.join(workspaceA, "test", "existing.test.js"), "\n// weakened\n");
  fs.appendFileSync(path.join(workspaceA, "data", "generate.js"), "\n// changed generator\n");
  fs.appendFileSync(path.join(workspaceA, "data", "store.js"), "\n// changed store\n");

  const blockedA = cli(["check", "A", "--trial", "trial-one", "--json"], {
    allowFailure: true,
  });
  assert.equal(blockedA.status, 1);
  const blockedAResult = JSON.parse(blockedA.stdout);
  assert.equal(blockedAResult.attempt.full.exitCode, 1);
  assert.equal(blockedAResult.attempt.fullDatasetCount, null);
  assert.match(blockedAResult.fullOutput, /trusted full-test script changed/i);
  assert.match(blockedAResult.fullOutput, /pretest lifecycle script changed/i);
  assert.match(blockedAResult.fullOutput, /preseed lifecycle script changed/i);
  assert.match(blockedAResult.fullOutput, /original regression changed/i);
  assert.match(blockedAResult.fullOutput, /generator changed/i);
  assert.match(blockedAResult.fullOutput, /store changed/i);

  for (const relative of [
    "package.json",
    "test/existing.test.js",
    "data/generate.js",
    "data/store.js",
  ]) {
    fs.copyFileSync(path.join(info.sourceRepo, relative), path.join(workspaceA, relative));
  }
  fs.writeFileSync(
    path.join(workspaceA, "test", "added.test.js"),
    `"use strict";\nconst test=require("node:test");\ntest("added coverage is allowed",()=>{});\n`,
  );

  const red = cli(["check", "A", "--trial", "trial-one", "--json"], { allowFailure: true });
  assert.equal(red.status, 1);
  const redResult = JSON.parse(red.stdout);
  assert.equal(redResult.attempt.passed, false);
  assert.equal(redResult.attempt.full.exitCode, 0);
  assert.equal(redResult.attempt.fullDatasetCount, 400000);
  assert.deepEqual(redResult.attempt.fullEnvironment, {
    INVOICE_AS_OF: "2026-09-18",
    INVOICE_COUNT: "400000",
    INVOICE_FIXTURE: null,
  });
  assert.notEqual(redResult.attempt.acceptance.exitCode, 0);
  assert.equal(redResult.attempt.data.acceptancePreservedData, true);
  assert.match(redResult.acceptanceOutput, /not ok/);
  assert.match(
    fs.readFileSync(redResult.attempt.acceptance.logPath, "utf8"),
    /Overdue only|overdue/i,
  );

  const correction = cli(["feedback", "A", "--trial", "trial-one"]).stdout;
  assert.match(correction, /observed failures/i);
  assert.match(correction, /Independent final verification failed/);
  assert.doesNotMatch(correction, /invented|guaranteed/);

  const twttyA = cli(["twtty", "A", "--trial", "trial-one"], { allowFailure: true });
  assert.notEqual(twttyA.status, 0);
  assert.match(twttyA.stderr, /only for lane B/);

  writeReferenceImplementation(workspaceA);
  const green = cli(["check", "A", "--trial", "trial-one", "--json"]);
  const greenResult = JSON.parse(green.stdout);
  assert.equal(greenResult.attempt.passed, true);
  assert.equal(greenResult.attempt.data.acceptancePreservedData, true);
  assert.equal(greenResult.attempt.acceptance.exitCode, 0);

  cli([
    "insights",
    "A",
    "--trial",
    "trial-one",
    "--provenance",
    "child session Insights",
    "--reference",
    "session-A",
    "--ai-credit-value",
    "12.5",
    "--ai-credit-unit",
    "AIU",
  ]);
  const afterAInsights = readState(info.statePath).lanes.A.insights;
  assert.equal(afterAInsights.inputTokens, null);
  assert.equal(afterAInsights.cost.value, null);
  assert.equal(afterAInsights.aiCredit.value, 12.5);

  const duplicateInsights = cli(
    [
      "record",
      "A",
      "--trial",
      "trial-one",
      "--provenance",
      "again",
      "--reference",
      "again",
    ],
    { allowFailure: true },
  );
  assert.notEqual(duplicateInsights.status, 0);
  assert.match(duplicateInsights.stderr, /refusing to overwrite/);

  cli(["start", "B", "--trial", "trial-one"]);
  const earlyTwtty = cli(["twtty", "B", "--trial", "trial-one"], { allowFailure: true });
  assert.notEqual(earlyTwtty.status, 0);
  assert.match(earlyTwtty.stderr, /actual failed check/);

  const packageB = JSON.parse(fs.readFileSync(path.join(workspaceB, "package.json"), "utf8"));
  packageB.scripts.test = "node --test --test-reporter=tap test/";
  fs.writeFileSync(path.join(workspaceB, "package.json"), `${JSON.stringify(packageB, null, 2)}\n`);
  fs.appendFileSync(path.join(workspaceB, "data", "generate.js"), "\n// changed generator\n");
  fs.appendFileSync(path.join(workspaceB, "data", "store.js"), "\n// changed store\n");
  const blockedB = cli(["check", "B", "--trial", "trial-one", "--json"], {
    allowFailure: true,
  });
  assert.equal(blockedB.status, 1);
  const blockedBResult = JSON.parse(blockedB.stdout);
  assert.match(blockedBResult.fullOutput, /trusted full-test script changed/i);
  assert.match(blockedBResult.fullOutput, /generator changed/i);
  assert.match(blockedBResult.fullOutput, /store changed/i);

  fs.copyFileSync(path.join(DEMO_ROOT, "prep", "package.json"), path.join(workspaceB, "package.json"));
  fs.copyFileSync(path.join(DEMO_ROOT, "baseline", "data", "generate.js"), path.join(workspaceB, "data", "generate.js"));
  fs.copyFileSync(path.join(DEMO_ROOT, "prep", "store.js"), path.join(workspaceB, "data", "store.js"));

  const redB = cli(["check", "B", "--trial", "trial-one", "--json"], {
    allowFailure: true,
  });
  assert.equal(redB.status, 1);
  const redBResult = JSON.parse(redB.stdout);
  assert.equal(redBResult.attempt.full.exitCode, 0);
  assert.equal(redBResult.attempt.fullDatasetCount, 400000);
  assert.deepEqual(redBResult.attempt.fullEnvironment, {
    INVOICE_AS_OF: "2026-09-18",
    INVOICE_COUNT: "400000",
    INVOICE_FIXTURE: null,
  });
  const twtty = cli(["twtty", "B", "--trial", "trial-one"]).stdout;
  assert.match(twtty, /Tell me What To Tell You/);
  assert.match(twtty, /Actual timed commands/);
  assert.match(twtty, /measured bottleneck/);
  assert.match(twtty, /preserves every FEATURE-REQUEST\.md criterion/);

  cli([
    "mark-incomplete",
    "B",
    "--trial",
    "trial-one",
    "--reason",
    "bounded test stagnation",
  ]);

  const missingUnit = cli(
    [
      "insights",
      "B",
      "--trial",
      "trial-one",
      "--provenance",
      "child session Insights",
      "--reference",
      "session-B",
      "--ai-credit-value",
      "4",
    ],
    { allowFailure: true },
  );
  assert.notEqual(missingUnit.status, 0);
  assert.match(missingUnit.stderr, /ai-credit-unit/);

  cli([
    "record",
    "B",
    "--trial",
    "trial-one",
    "--provenance",
    "child session Insights",
    "--reference",
    "session-B",
    "--ai-credit-value",
    "4",
    "--ai-credit-unit",
    "credits",
    "--input-tokens",
    "100",
    "--output-tokens",
    "20",
    "--api-calls",
    "2",
    "--model-runtime-seconds",
    "1.25",
  ]);

  const comparison = JSON.parse(
    cli(["compare", "--trial", "trial-one", "--json"]).stdout,
  );
  assert.equal(comparison.A.status, "passed");
  assert.equal(comparison.B.status, "incomplete");
  assert.equal(comparison.B.wallMs, null);
  assert.equal(comparison.A.iterations, 3);
  assert.equal(comparison.B.iterations, 2);
  assert.equal(comparison.B.interventions, 1);
  assert.equal(comparison.B.insights.cacheReadTokens, null);
  assert.equal(comparison.B.insights.cacheWriteTokens, null);
  assert.equal(comparison.unmeasuredPreparation.authoringMs, null);
  assert.equal(comparison.unmeasuredPreparation.hostProjectProvisioningMs, null);
  assert.equal(comparison.unmeasuredPreparation.hostSessionProvisioningMs, null);
  assert.match(comparison.preparationTimingScope, /materialization\/overlay only/);
  assert.equal(comparison.A.endToEndTotalMs, null);
  assert.equal(comparison.B.endToEndTotalMs, null);
  assert.ok(comparison.A.totalIncludingWorkspacePreparationMs > 0);
  assert.equal("totalIncludingPreparationMs" in comparison.A, false);
  assert.match(comparison.conclusion, /No winner is inferred/);
  assert.match(comparison.timingScope, /round trips/);
});
