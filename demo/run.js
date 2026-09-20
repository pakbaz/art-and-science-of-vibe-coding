#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");

const DEMO_ROOT = __dirname;
const RUNS_ROOT = path.resolve(process.env.DEMO_RUNS_ROOT || path.join(DEMO_ROOT, ".runs"));
const FEATURE_PROMPT =
  "Add the overdue-invoices feature in FEATURE-REQUEST.md. Make it work and check it.\n" +
  "Work only in this repository.";
const AS_OF = "2026-09-18";
const LANES = new Set(["A", "B"]);
const snapshots = new WeakMap();
const heldLocks = new Map();

class CliError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

function now() {
  return new Date().toISOString();
}

function elapsedMs(start) {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help") {
      flags.help = true;
      continue;
    }
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    if (["json", "parallel", "copilot", "existing-project"].includes(key)) {
      flags[key] = true;
      continue;
    }
    if (index + 1 >= argv.length || argv[index + 1].startsWith("--")) {
      throw new CliError(`--${key} requires a value`);
    }
    flags[key] = argv[index + 1];
    index += 1;
  }
  return { positionals, flags };
}

function assertAllowedFlags(flags, allowed) {
  const valid = new Set(allowed);
  for (const key of Object.keys(flags)) {
    if (!valid.has(key)) throw new CliError(`unknown option --${key}`);
  }
}

function requireLane(value) {
  const lane = String(value || "").toUpperCase();
  if (!LANES.has(lane)) throw new CliError("lane must be A or B");
  return lane;
}

function safeTrialId(value) {
  const id = value || new Date().toISOString().replace(/[:.]/g, "-");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id)) {
    throw new CliError("trial id must use 1-80 letters, numbers, dots, underscores, or hyphens");
  }
  return id;
}

function statePathFrom(flags) {
  if (flags.state && flags.trial) throw new CliError("use --state or --trial, not both");
  const candidate = flags.state
    ? path.resolve(flags.state)
    : flags.trial
      ? path.join(RUNS_ROOT, safeTrialId(flags.trial), "state.json")
      : null;
  if (!candidate) throw new CliError("this command requires --trial <id> or --state <path>");
  return candidate;
}

function readState(flags) {
  const statePath = statePathFrom(flags);
  if (!fs.existsSync(statePath)) throw new CliError(`state file not found: ${statePath}`);
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (error) {
    throw new CliError(`cannot parse state file ${statePath}: ${error.message}`);
  }
  if (state.version !== 1 || !state.trialId || !state.sourceRepo || !state.lanes) {
    throw new CliError(`unsupported or invalid state file: ${statePath}`);
  }
  state.statePath = statePath;
  const snapshot = structuredClone(state);
  delete snapshot.statePath;
  snapshots.set(state, snapshot);
  return state;
}

function releaseLock(file) {
  const fd = heldLocks.get(file);
  if (fd === undefined) return;
  try {
    const original = fs.fstatSync(fd);
    let current;
    try {
      current = fs.statSync(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (current) {
      if (original.ino !== current.ino || original.dev !== current.dev) {
        throw new CliError(`lock was replaced while in use: ${file}`);
      }
      fs.unlinkSync(file);
    }
  } finally {
    heldLocks.delete(file);
    fs.closeSync(fd);
  }
}

function withLock(file, action, waitMs = 0) {
  const deadline = Date.now() + waitMs;
  let fd;
  while (fd === undefined) {
    try {
      fd = fs.openSync(file, "wx");
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() >= deadline) {
        throw new CliError(
          `another command holds lock ${file}. Wait for it to finish. ` +
          "If it crashed, verify the PID in the lock file has exited before removing that lock.",
        );
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  heldLocks.set(file, fd);
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: now() }));
    return action();
  } finally {
    releaseLock(file);
  }
}

function mergeStateValue(base, updated, current, key = "") {
  if (isDeepStrictEqual(updated, base)) return current;
  if (isDeepStrictEqual(current, base)) return updated;
  if (key === "events" && [base, updated, current].every(Array.isArray)) {
    if (isDeepStrictEqual(updated.slice(0, base.length), base) &&
        isDeepStrictEqual(current.slice(0, base.length), base)) {
      return [...current, ...updated.slice(base.length)];
    }
  }
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  if ([base, updated, current].every(object)) {
    const merged = { ...current };
    for (const field of new Set([...Object.keys(base), ...Object.keys(updated)])) {
      const value = mergeStateValue(base[field], updated[field], current[field], key ? `${key}.${field}` : field);
      if (value === undefined) delete merged[field];
      else merged[field] = value;
    }
    return merged;
  }
  throw new CliError(`concurrent state change at ${key}; retry after the other command finishes`);
}

function writeState(state) {
  const target = state.statePath;
  withLock(`${target}.lock`, () => {
    const serializable = { ...state };
    delete serializable.statePath;
    const snapshot = snapshots.get(state);
    let merged = serializable;
    if (fs.existsSync(target)) {
      if (!snapshot) throw new CliError(`refusing to overwrite existing state: ${target}`);
      const current = JSON.parse(fs.readFileSync(target, "utf8"));
      merged = mergeStateValue(snapshot, serializable, current);
    }
    const temporary = `${target}.next-${process.pid}`;
    fs.writeFileSync(temporary, `${JSON.stringify(merged, null, 2)}\n`);
    fs.renameSync(temporary, target);
    Object.assign(state, merged);
    snapshots.set(state, structuredClone(merged));
  }, 5000);
}

function run(command, args, options = {}) {
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    command: [command, ...args].join(" "),
    status: result.status === null ? 1 : result.status,
    signal: result.signal,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : null,
    elapsedMs: elapsedMs(started),
  };
}

function git(cwd, args, options = {}) {
  const result = run("git", ["--no-pager", ...args], { cwd, env: options.env });
  if (result.status !== 0 && !options.allowFailure) {
    throw new CliError(
      `git ${args.join(" ")} failed in ${cwd}\n${result.stdout}${result.stderr}`.trim(),
      1,
    );
  }
  return result;
}

function copyTree(source, target, relativeDirectory = "") {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const relative = path.join(relativeDirectory, entry.name);
    if (relative === path.join("data", "invoices.json")) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isSymbolicLink()) throw new CliError(`refusing to copy symlink: ${from}`);
    if (entry.isDirectory()) copyTree(from, to, relative);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function copyBaseline(sourceRepo) {
  const baseline = path.join(DEMO_ROOT, "baseline");
  copyTree(baseline, sourceRepo);
  fs.copyFileSync(
    path.join(DEMO_ROOT, "FEATURE-REQUEST.md"),
    path.join(sourceRepo, "FEATURE-REQUEST.md"),
  );
}

function fileHashes(root) {
  const hashes = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new CliError(`trusted baseline contains symlink: ${fullPath}`);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) {
        hashes[path.relative(root, fullPath).split(path.sep).join("/")] = sha256(fullPath);
      }
    }
  }
  visit(root);
  return hashes;
}

function trustedBaseline(sourceRepo) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRepo, "package.json"), "utf8"));
  const regressionFiles = Object.fromEntries(
    Object.entries(fileHashes(path.join(sourceRepo, "test"))).map(([relative, hash]) => [
      `test/${relative}`,
      hash,
    ]),
  );
  return {
    fullInvoiceCount: 400000,
    fullTestScript: packageJson.scripts.test,
    seedScript: packageJson.scripts.seed,
    pretestScript: packageJson.scripts.pretest || null,
    posttestScript: packageJson.scripts.posttest || null,
    preseedScript: packageJson.scripts.preseed || null,
    postseedScript: packageJson.scripts.postseed || null,
    regressionFiles,
    generatorHash: sha256(path.join(sourceRepo, "data", "generate.js")),
    storeHashes: {
      A: sha256(path.join(sourceRepo, "data", "store.js")),
      B: sha256(path.join(DEMO_ROOT, "prep", "store.js")),
    },
  };
}

function createProjectBaseline(trialRoot, trialId) {
  const sourceRepo = gitTop(DEMO_ROOT);
  const commonGitDir = gitCommon(sourceRepo);
  const baseBranch = `demo-baseline/${trialId}`;
  const ref = `refs/heads/${baseBranch}`;
  git(sourceRepo, ["check-ref-format", ref]);
  const existing = git(sourceRepo, ["show-ref", "--verify", "--quiet", ref], { allowFailure: true });
  if (existing.status === 0) throw new CliError(`baseline branch already exists: ${baseBranch}`);
  if (existing.status !== 1) {
    throw new CliError(`cannot check baseline branch: ${existing.stderr || existing.error}`, 1);
  }

  const baseline = path.join(trialRoot, "baseline");
  copyBaseline(baseline);
  const index = path.join(trialRoot, "baseline.index");
  const env = {
    ...process.env,
    GIT_DIR: commonGitDir,
    GIT_WORK_TREE: baseline,
    GIT_INDEX_FILE: index,
    GIT_AUTHOR_NAME: "Demo Runner",
    GIT_AUTHOR_EMAIL: "demo-runner@invalid.local",
    GIT_COMMITTER_NAME: "Demo Runner",
    GIT_COMMITTER_EMAIL: "demo-runner@invalid.local",
  };
  let baseCommit;
  try {
    git(baseline, ["-c", "core.splitIndex=false", "read-tree", "--empty"], { env });
    git(baseline, ["-c", "core.splitIndex=false", "add", "--all", "--", "."], { env });
    const tree = git(baseline, ["write-tree"], { env }).stdout.trim();
    baseCommit = git(baseline, [
      "commit-tree", tree,
      "-m", "Initial invoice admin baseline",
      "-m", "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>",
    ], { env }).stdout.trim();
    git(baseline, ["update-ref", ref, baseCommit, "0".repeat(baseCommit.length)], { env });
  } finally {
    if (fs.existsSync(index)) fs.unlinkSync(index);
  }
  return { sourceRepo, baseBranch, baseCommit, baseline };
}

function prepare(flags) {
  const trialId = safeTrialId(flags.id);
  const trialRoot = path.join(RUNS_ROOT, trialId);
  if (fs.existsSync(trialRoot)) {
    throw new CliError(`trial already exists; refusing to overwrite: ${trialRoot}`);
  }
  fs.mkdirSync(RUNS_ROOT, { recursive: true });
  fs.mkdirSync(trialRoot);

  const started = process.hrtime.bigint();
  let sourceRepo, baseCommit, baseline;
  let baseBranch = null;
  if (flags["existing-project"]) {
    ({ sourceRepo, baseBranch, baseCommit, baseline } = createProjectBaseline(trialRoot, trialId));
  } else {
    sourceRepo = path.join(trialRoot, "source");
    fs.mkdirSync(sourceRepo, { recursive: true });
    copyBaseline(sourceRepo);
    git(sourceRepo, ["init", "--quiet"]);
    git(sourceRepo, ["config", "user.name", "Demo Runner"]);
    git(sourceRepo, ["config", "user.email", "demo-runner@invalid.local"]);
    git(sourceRepo, ["add", "."]);
    git(sourceRepo, [
      "commit",
      "--quiet",
      "-m",
      "Initial invoice admin baseline",
      "-m",
      "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>",
    ]);
    baseCommit = git(sourceRepo, ["rev-parse", "HEAD"]).stdout.trim();
    baseline = sourceRepo;
  }

  const statePath = path.join(trialRoot, "state.json");
  const state = {
    version: 1,
    trialId,
    executionMode: flags.parallel ? "parallel" : "sequential",
    createdAt: now(),
    statePath,
    trialRoot,
    sourceRepo,
    sourceMode: flags["existing-project"] ? "existing-project" : "standalone",
    baseBranch,
    baseCommit,
    trusted: trustedBaseline(baseline),
    prompt: FEATURE_PROMPT,
    asOf: AS_OF,
    preparation: {
      sourceMs: elapsedMs(started),
      laneASetupMs: null,
      laneBSetupMs: null,
      authoringMs: null,
      hostProjectProvisioningMs: null,
      hostSessionProvisioningMs: null,
    },
    lanes: {
      A: newLane(),
      B: newLane(),
    },
    events: [{ type: "prepared", at: now() }],
  };
  writeState(state);
  return {
    trialId,
    executionMode: state.executionMode,
    sourceMode: state.sourceMode,
    sourceRepo,
    statePath,
    baseBranch,
    baseCommit,
    prompt: FEATURE_PROMPT,
  };
}

function newLane() {
  return {
    workspace: null,
    sessionId: null,
    attachedAt: null,
    baseProof: null,
    status: "unattached",
    startedAt: null,
    stoppedAt: null,
    incompleteAt: null,
    incompleteReason: null,
    attempts: [],
    interventions: [],
    insights: null,
  };
}

function exactRealDirectory(candidate, label) {
  const resolved = path.resolve(candidate);
  if (!fs.existsSync(resolved)) throw new CliError(`${label} does not exist: ${resolved}`);
  if (!fs.statSync(resolved).isDirectory()) throw new CliError(`${label} is not a directory: ${resolved}`);
  const real = fs.realpathSync(resolved);
  if (real !== resolved) throw new CliError(`${label} uses a symlinked path; pass its real path`);
  return real;
}

function gitTop(workspace) {
  return fs.realpathSync(git(workspace, ["rev-parse", "--show-toplevel"]).stdout.trim());
}

function gitCommon(workspace) {
  const raw = git(workspace, ["rev-parse", "--git-common-dir"]).stdout.trim();
  return fs.realpathSync(path.resolve(workspace, raw));
}

function validateWorkspace(state, candidate) {
  const workspace = exactRealDirectory(candidate, "workspace");
  const sourceRepo = fs.realpathSync(state.sourceRepo);
  if (workspace === sourceRepo) throw new CliError("the source repository cannot be attached as a lane");
  if (gitTop(workspace) !== workspace) throw new CliError("workspace must be the root of a git worktree");
  if (gitCommon(workspace) !== gitCommon(sourceRepo)) {
    throw new CliError("workspace is not a worktree of this trial's source repository");
  }
  const head = git(workspace, ["rev-parse", "HEAD"]).stdout.trim();
  if (head !== state.baseCommit) {
    throw new CliError(`workspace HEAD ${head} does not match trial base ${state.baseCommit}`);
  }
  const dirty = git(workspace, ["status", "--porcelain", "--untracked-files=all"]).stdout.trim();
  if (dirty) throw new CliError(`workspace must be pristine before attach:\n${dirty}`);
  for (const required of ["README.md", "FEATURE-REQUEST.md", "package.json", "src/server.js"]) {
    if (!fs.existsSync(path.join(workspace, required))) {
      throw new CliError(`workspace is missing baseline file ${required}`);
    }
  }
  return {
    workspace,
    head,
    commonGitDir: gitCommon(workspace),
    cleanAtAttach: true,
  };
}

function overlayB(workspace) {
  const started = process.hrtime.bigint();
  fs.copyFileSync(path.join(DEMO_ROOT, "prep", "AGENTS.md"), path.join(workspace, "AGENTS.md"));
  fs.copyFileSync(
    path.join(DEMO_ROOT, "prep", "fixture-100.json"),
    path.join(workspace, "data", "fixture-100.json"),
  );
  fs.copyFileSync(path.join(DEMO_ROOT, "prep", "store.js"), path.join(workspace, "data", "store.js"));
  fs.copyFileSync(path.join(DEMO_ROOT, "prep", "package.json"), path.join(workspace, "package.json"));
  return elapsedMs(started);
}

function attach(state, lane, workspaceArg, sessionId) {
  if (!sessionId) throw new CliError("attach requires --session <real child session id>");
  sessionId = String(sessionId).trim();
  if (!sessionId) throw new CliError("attach requires a non-empty --session id");
  if (state.lanes[lane].workspace) throw new CliError(`lane ${lane} is already attached`);
  const other = lane === "A" ? "B" : "A";
  if (state.lanes[other].sessionId === sessionId) {
    throw new CliError(`session id ${sessionId} is already attached to lane ${other}`);
  }
  const proof = validateWorkspace(state, workspaceArg);
  if (state.lanes[other].workspace === proof.workspace) {
    throw new CliError("A and B must use distinct worktree directories");
  }

  const setupStarted = process.hrtime.bigint();
  let overlayMs = 0;
  if (lane === "B") overlayMs = overlayB(proof.workspace);
  const setupMs = elapsedMs(setupStarted);

  state.lanes[lane] = {
    ...state.lanes[lane],
    workspace: proof.workspace,
    sessionId,
    attachedAt: now(),
    baseProof: proof,
    status: "ready",
  };
  if (lane === "A") state.preparation.laneASetupMs = setupMs;
  else state.preparation.laneBSetupMs = setupMs;
  state.events.push({ type: "attached", lane, at: now(), setupMs, overlayMs });
  writeState(state);
  return {
    lane,
    workspace: proof.workspace,
    sessionId,
    baseCommit: proof.head,
    commonGitDir: proof.commonGitDir,
    setupMs,
    overlayMs,
  };
}

function createWorktrees(state) {
  const created = [];
  for (const lane of ["A", "B"]) {
    if (state.lanes[lane].workspace) continue;
    const workspace = path.join(state.trialRoot, "worktrees", lane);
    if (fs.existsSync(workspace)) {
      throw new CliError(`refusing to reuse existing path: ${workspace}`);
    }
    fs.mkdirSync(path.dirname(workspace), { recursive: true });
    git(state.sourceRepo, ["worktree", "add", "--quiet", "--detach", workspace, state.baseCommit]);
    created.push(attach(state, lane, workspace, crypto.randomUUID()));
    state = readState({ state: state.statePath });
  }
  return { created, alreadyAttached: 2 - created.length };
}

function startLane(state, lane) {
  const record = state.lanes[lane];
  if (!record.workspace) throw new CliError(`attach lane ${lane} before starting it`);
  if (record.status !== "ready") throw new CliError(`lane ${lane} cannot start from status ${record.status}`);
  exactRealDirectory(record.workspace, `lane ${lane} workspace`);
  const other = lane === "A" ? "B" : "A";
  if (state.executionMode !== "parallel" && state.lanes[other].status === "running") {
    throw new CliError(`lane ${other} is still running; runs must be sequential`);
  }
  if (state.executionMode !== "parallel" && lane === "B" &&
      !["passed", "incomplete"].includes(state.lanes.A.status)) {
    throw new CliError("finish lane A (pass or mark incomplete) before starting lane B");
  }
  record.status = "running";
  record.startedAt = now();
  state.events.push({ type: "started", lane, at: record.startedAt });
  writeState(state);
  return { lane, startedAt: record.startedAt, prompt: state.prompt };
}

function sha256(file) {
  if (!fs.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function commandLogPath(state, lane, attempt, kind) {
  const directory = path.join(state.trialRoot, "logs", lane);
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, `attempt-${String(attempt).padStart(3, "0")}-${kind}.tap`);
}

function persistCommandLog(file, command) {
  const header = [
    `command: ${command.command}`,
    `exit: ${command.status}`,
    `elapsed_ms: ${command.elapsedMs}`,
    command.signal ? `signal: ${command.signal}` : null,
    command.error ? `spawn_error: ${command.error}` : null,
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
  fs.writeFileSync(file, `${header}${command.stdout}${command.stderr}`);
}

function fullTestEnvironment(asOf) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("INVOICE_")) delete env[key];
  }
  env.INVOICE_AS_OF = asOf;
  env.INVOICE_COUNT = "400000";
  return env;
}

function verifyTrustedFullPath(state, lane) {
  const workspace = state.lanes[lane].workspace;
  const trusted = state.trusted;
  const errors = [];
  if (!trusted) return ["trial state has no trusted full-test baseline"];

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(path.join(workspace, "package.json"), "utf8"));
  } catch (error) {
    errors.push(`package.json cannot be read: ${error.message}`);
  }
  if (packageJson) {
    if (packageJson.scripts?.test !== trusted.fullTestScript) {
      errors.push("trusted full-test script changed");
    }
    if (packageJson.scripts?.seed !== trusted.seedScript) {
      errors.push("trusted seed script changed");
    }
    if ((packageJson.scripts?.pretest || null) !== trusted.pretestScript) {
      errors.push("pretest lifecycle script changed");
    }
    if ((packageJson.scripts?.posttest || null) !== trusted.posttestScript) {
      errors.push("posttest lifecycle script changed");
    }
    if ((packageJson.scripts?.preseed || null) !== trusted.preseedScript) {
      errors.push("preseed lifecycle script changed");
    }
    if ((packageJson.scripts?.postseed || null) !== trusted.postseedScript) {
      errors.push("postseed lifecycle script changed");
    }
  }

  for (const [relative, expected] of Object.entries(trusted.regressionFiles)) {
    const file = path.join(workspace, ...relative.split("/"));
    if (!fs.existsSync(file)) errors.push(`original regression deleted: ${relative}`);
    else if (sha256(file) !== expected) errors.push(`original regression changed: ${relative}`);
  }

  const generator = path.join(workspace, "data", "generate.js");
  if (!fs.existsSync(generator) || sha256(generator) !== trusted.generatorHash) {
    errors.push("trusted 400k generator changed");
  }
  const store = path.join(workspace, "data", "store.js");
  if (!fs.existsSync(store) || sha256(store) !== trusted.storeHashes[lane]) {
    errors.push(`trusted lane ${lane} store changed`);
  }
  return errors;
}

function blockedFullCommand(errors, elapsed) {
  const details = errors.map((error) => `    - ${error}`).join("\n");
  return {
    command: "npm test (blocked by trusted full-test preflight)",
    status: 1,
    signal: null,
    stdout:
      "TAP version 13\n" +
      "not ok 1 - trusted full-test preflight\n" +
      "  ---\n" +
      "  message: |-\n" +
      "    The immutable full-test path no longer matches the prepared baseline.\n" +
      `${details}\n` +
      "  ...\n" +
      "1..1\n# tests 1\n# pass 0\n# fail 1\n",
    stderr: "",
    error: null,
    elapsedMs: elapsed,
  };
}

function fullDatasetCount(dataFile) {
  const parsed = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("data/invoices.json is not an array");
  return parsed.length;
}

function checkLane(state, lane) {
  const record = state.lanes[lane];
  if (record.status !== "running") throw new CliError(`lane ${lane} is not running`);
  exactRealDirectory(record.workspace, `lane ${lane} workspace`);
  const attemptNumber = record.attempts.length + 1;
  const checkStartedAt = now();

  const pendingIntervention = [...record.interventions]
    .reverse()
    .find((intervention) => !intervention.endedAt);
  if (pendingIntervention) {
    pendingIntervention.endedAt = checkStartedAt;
    pendingIntervention.elapsedMs =
      Date.parse(pendingIntervention.endedAt) - Date.parse(pendingIntervention.startedAt);
  }

  const dataFile = path.join(record.workspace, "data", "invoices.json");
  const beforeFullHash = sha256(dataFile);
  const fullEnv = fullTestEnvironment(state.asOf);
  const preflightStarted = process.hrtime.bigint();
  const preflightErrors = verifyTrustedFullPath(state, lane);
  const full = preflightErrors.length
    ? blockedFullCommand(preflightErrors, elapsedMs(preflightStarted))
    : run("npm", ["test"], { cwd: record.workspace, env: fullEnv });
  let verifiedFullDatasetCount = null;
  if (full.status === 0) {
    try {
      verifiedFullDatasetCount = fullDatasetCount(dataFile);
      if (verifiedFullDatasetCount !== state.trusted.fullInvoiceCount) {
        full.status = 1;
        full.stderr +=
          `\nFull dataset verification failed: expected ${state.trusted.fullInvoiceCount} rows, ` +
          `found ${verifiedFullDatasetCount}.\n`;
      }
    } catch (error) {
      full.status = 1;
      full.stderr += `\nFull dataset verification failed: ${error.message}\n`;
    }
  }
  const afterFullHash = sha256(dataFile);
  const beforeAcceptanceHash = afterFullHash;
  const acceptanceEnv = { ...process.env };
  for (const key of Object.keys(acceptanceEnv)) {
    if (key.startsWith("INVOICE_")) delete acceptanceEnv[key];
  }
  acceptanceEnv.INVOICE_AS_OF = state.asOf;
  acceptanceEnv.APP_ROOT = record.workspace;
  const acceptance = run(
    process.execPath,
    ["--test", "--test-reporter=tap", path.join(DEMO_ROOT, "gate", "acceptance.test.js")],
    {
      cwd: record.workspace,
      env: acceptanceEnv,
    },
  );
  const afterAcceptanceHash = sha256(dataFile);

  const fullLog = commandLogPath(state, lane, attemptNumber, "full");
  const acceptanceLog = commandLogPath(state, lane, attemptNumber, "acceptance");
  persistCommandLog(fullLog, full);
  persistCommandLog(acceptanceLog, acceptance);

  const attempt = {
    number: attemptNumber,
    startedAt: checkStartedAt,
    completedAt: now(),
    passed: full.status === 0 && acceptance.status === 0 && beforeAcceptanceHash === afterAcceptanceHash,
    preflightErrors,
    fullDatasetCount: verifiedFullDatasetCount,
    fullEnvironment: {
      INVOICE_AS_OF: fullEnv.INVOICE_AS_OF,
      INVOICE_COUNT: fullEnv.INVOICE_COUNT,
      INVOICE_FIXTURE: fullEnv.INVOICE_FIXTURE || null,
    },
    full: summarizeCommand(full, fullLog),
    acceptance: summarizeCommand(acceptance, acceptanceLog),
    data: {
      beforeFullHash,
      afterFullHash,
      beforeAcceptanceHash,
      afterAcceptanceHash,
      acceptancePreservedData: beforeAcceptanceHash === afterAcceptanceHash,
    },
  };
  record.attempts.push(attempt);
  if (attempt.passed) {
    record.status = "passed";
    record.stoppedAt = attempt.completedAt;
  }
  state.events.push({
    type: "checked",
    lane,
    at: attempt.completedAt,
    attempt: attemptNumber,
    passed: attempt.passed,
  });
  writeState(state);
  return { attempt, full, acceptance, stoppedAt: record.stoppedAt };
}

function summarizeCommand(command, logPath) {
  return {
    command: command.command,
    exitCode: command.status,
    signal: command.signal,
    spawnError: command.error,
    elapsedMs: command.elapsedMs,
    logPath,
  };
}

function feedback(state, lane) {
  const attempts = state.lanes[lane].attempts;
  if (!attempts.length) throw new CliError(`lane ${lane} has no check output`);
  const latest = attempts.at(-1);
  if (latest.passed) return "All recorded checks pass; no corrective follow-up is needed.";
  const sections = [];
  for (const [label, command] of [
    ["Repository full test", latest.full],
    ["Independent final verification", latest.acceptance],
  ]) {
    if (command.exitCode === 0) continue;
    const output = fs.readFileSync(command.logPath, "utf8").trim();
    sections.push(`${label} failed:\n\n${output}`);
  }
  if (!latest.data.acceptancePreservedData) {
    sections.push("Independent final verification changed data/invoices.json.");
  }
  return (
    "The checks did not all pass. Fix only the observed failures below, keep every " +
    "FEATURE-REQUEST.md criterion intact, and run the repository's full test command again. " +
    "Work only in this repository.\n\n" +
    sections.join("\n\n")
  );
}

function extractFailedCoverage(logPath) {
  const output = fs.readFileSync(logPath, "utf8");
  const names = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(?:not ok \d+ -|✖)\s*(.+)$/);
    if (match) names.push(match[1].trim());
  }
  return [...new Set(names)].slice(0, 12);
}

function twtty(state, lane) {
  if (lane !== "B") throw new CliError("TWTTY intervention is available only for lane B");
  const record = state.lanes.B;
  if (record.status !== "running") throw new CliError("lane B must be running");
  const latest = record.attempts.at(-1);
  if (!latest || latest.passed) {
    throw new CliError("TWTTY is only appropriate after lane B has an actual failed check");
  }
  if (record.interventions.some((intervention) => !intervention.endedAt)) {
    throw new CliError("a TWTTY intervention is already being timed");
  }
  const commands = [latest.full, latest.acceptance];
  const slowest = commands.reduce((left, right) => (left.elapsedMs >= right.elapsedMs ? left : right));
  const missing = extractFailedCoverage(latest.acceptance.logPath);
  const generationStarted = process.hrtime.bigint();
  const prompt = [
    "Tell me What To Tell You.",
    "",
    `Actual timed commands from the latest check:`,
    ...commands.map(
      (command) =>
        `- ${command.command}: ${(command.elapsedMs / 1000).toFixed(2)}s, exit ${command.exitCode}`,
    ),
    `The measured bottleneck is ${slowest.command} at ${(slowest.elapsedMs / 1000).toFixed(2)}s.`,
    missing.length
      ? `Observed missing coverage: ${missing.join("; ")}.`
      : "No individual failed assertion names were parsed; use the attached check output.",
    "",
    "Diagnose the bottleneck and propose the smallest safe workflow or test change that preserves " +
      "every FEATURE-REQUEST.md criterion. State what coverage the change might lose, add any " +
      "missing focused coverage, and define how to measure whether it helped. Do not weaken or " +
      "change the acceptance criteria. Work only in this repository.",
  ].join("\n");
  const intervention = {
    number: record.interventions.length + 1,
    startedAt: now(),
    endedAt: null,
    elapsedMs: null,
    generationMs: elapsedMs(generationStarted),
    basedOnAttempt: latest.number,
    slowestCommand: slowest.command,
    slowestElapsedMs: slowest.elapsedMs,
    observedMissingCoverage: missing,
    prompt,
  };
  record.interventions.push(intervention);
  state.events.push({ type: "twtty", lane: "B", at: intervention.startedAt });
  writeState(state);
  return intervention;
}

function markIncomplete(state, lane, reason) {
  const record = state.lanes[lane];
  if (record.status !== "running") throw new CliError(`lane ${lane} is not running`);
  if (!reason) throw new CliError("mark-incomplete requires --reason <text>");
  record.status = "incomplete";
  record.incompleteAt = now();
  record.incompleteReason = reason;
  state.events.push({ type: "incomplete", lane, at: record.incompleteAt, reason });
  writeState(state);
  return {
    lane,
    status: record.status,
    incompleteAt: record.incompleteAt,
    note: "The pass clock has no stoppedAt value because final checks never passed.",
  };
}

function nullableNumber(flags, key, integer = false) {
  if (flags[key] === undefined) return null;
  const value = Number(flags[key]);
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new CliError(`--${key} must be a non-negative ${integer ? "integer" : "number"}`);
  }
  return value;
}

function recordInsights(state, lane, flags) {
  const record = state.lanes[lane];
  if (!record.workspace) throw new CliError(`lane ${lane} is not attached`);
  if (record.insights) throw new CliError(`lane ${lane} already has Insights; refusing to overwrite`);
  if (!flags.provenance || !flags.reference) {
    throw new CliError("record requires --provenance and --reference from the child-session Insights");
  }
  const costValue = nullableNumber(flags, "cost-value");
  const aiCreditValue = nullableNumber(flags, "ai-credit-value");
  if (costValue !== null && !flags["cost-unit"]) throw new CliError("--cost-unit is required with --cost-value");
  if (aiCreditValue !== null && !flags["ai-credit-unit"]) {
    throw new CliError("--ai-credit-unit is required with --ai-credit-value");
  }
  const insights = {
    recordedAt: now(),
    provenance: flags.provenance,
    reference: flags.reference,
    model: flags.model || null,
    cost: { value: costValue, unit: flags["cost-unit"] || null },
    aiCredit: { value: aiCreditValue, unit: flags["ai-credit-unit"] || null },
    inputTokens: nullableNumber(flags, "input-tokens", true),
    outputTokens: nullableNumber(flags, "output-tokens", true),
    cacheReadTokens: nullableNumber(flags, "cache-read-tokens", true),
    cacheWriteTokens: nullableNumber(flags, "cache-write-tokens", true),
    apiCalls: nullableNumber(flags, "api-calls", true),
    modelRuntimeSeconds: nullableNumber(flags, "model-runtime-seconds"),
  };
  record.insights = insights;
  state.events.push({ type: "insights", lane, at: insights.recordedAt });
  writeState(state);
  return insights;
}

function laneMetrics(state, lane) {
  const record = state.lanes[lane];
  const activeCommandMs = record.attempts.reduce(
    (total, attempt) => total + attempt.full.elapsedMs + attempt.acceptance.elapsedMs,
    0,
  );
  const wallMs =
    record.startedAt && record.stoppedAt
      ? Date.parse(record.stoppedAt) - Date.parse(record.startedAt)
      : null;
  const setupMs =
    lane === "A" ? state.preparation.laneASetupMs : state.preparation.laneBSetupMs;
  return {
    status: record.status,
    wallMs,
    iterations: record.attempts.length,
    activeCommandMs,
    setupMs,
    totalIncludingLaneSetupMs: wallMs === null || setupMs === null ? null : wallMs + setupMs,
    totalIncludingWorkspacePreparationMs:
      wallMs === null || setupMs === null
        ? null
        : wallMs + setupMs + state.preparation.sourceMs,
    endToEndTotalMs: null,
    interventions: record.interventions.length,
    insights: record.insights,
    incompleteReason: record.incompleteReason,
  };
}

function compare(state) {
  const comparison = {
    trialId: state.trialId,
    executionMode: state.executionMode || "sequential",
    resourceContention: state.executionMode === "parallel"
      ? "Parallel lanes share CPU, disk and network resources; wall times are not an isolated latency benchmark."
      : "Sequential lanes avoid intentional overlap; host load and presenter pauses still affect wall time.",
    sourcePreparationMs: state.preparation.sourceMs,
    preparationTimingScope:
      "workspace materialization/overlay only; authoring and host-session provisioning not measured",
    unmeasuredPreparation: {
      authoringMs: state.preparation.authoringMs ?? null,
      hostProjectProvisioningMs: state.preparation.hostProjectProvisioningMs ?? null,
      hostSessionProvisioningMs: state.preparation.hostSessionProvisioningMs ?? null,
    },
    A: laneMetrics(state, "A"),
    B: laneMetrics(state, "B"),
    timingScope:
      "Wall time starts immediately before the presenter sends the prompt and stops only after " +
      "both the full repository test and independent acceptance pass. It includes model work, " +
      "tool time, round trips, feedback, and user pauses.",
    conclusion:
      "No winner is inferred. Compare only completed lanes and only Insights values with matching units.",
  };
  return comparison;
}

function formatMs(value) {
  return value === null ? "n/a" : `${(value / 1000).toFixed(2)}s`;
}

function formatInsights(insights) {
  if (!insights) return ["  Insights: not recorded"];
  const display = (value) => (value === null ? "missing" : String(value));
  return [
    `  Insights provenance: ${insights.provenance} (${insights.reference})`,
    `  model: ${insights.model || "missing"}`,
    `  cost: ${display(insights.cost.value)} ${insights.cost.unit || "(unit missing)"}`,
    `  AI credit: ${display(insights.aiCredit.value)} ${insights.aiCredit.unit || "(unit missing)"}`,
    `  tokens input/output/cache-read/cache-write: ${display(insights.inputTokens)}/${display(
      insights.outputTokens,
    )}/${display(insights.cacheReadTokens)}/${display(insights.cacheWriteTokens)}`,
    `  API calls: ${display(insights.apiCalls)}`,
    `  model runtime: ${display(insights.modelRuntimeSeconds)} seconds`,
  ];
}

function printComparison(value) {
  const lines = [
    `Trial ${value.trialId}`,
    `Execution mode: ${value.executionMode}`,
    value.resourceContention,
    `Shared source preparation: ${formatMs(value.sourcePreparationMs)}`,
    `Preparation timing scope: ${value.preparationTimingScope}`,
    "Reusable setup authoring: unknown",
    "Host project/session provisioning: unknown",
  ];
  for (const lane of ["A", "B"]) {
    const item = value[lane];
    lines.push(
      "",
      `${lane}: ${item.status}`,
      `  wall time to pass: ${formatMs(item.wallMs)}`,
      `  check iterations: ${item.iterations}`,
      `  active command time: ${formatMs(item.activeCommandMs)}`,
      `  lane setup: ${formatMs(item.setupMs)}`,
      `  total including lane setup: ${formatMs(item.totalIncludingLaneSetupMs)}`,
      `  total including measured workspace preparation: ${formatMs(
        item.totalIncludingWorkspacePreparationMs,
      )}`,
      "  end-to-end total: unknown",
      `  TWTTY interventions: ${item.interventions}`,
      ...(item.incompleteReason ? [`  incomplete reason: ${item.incompleteReason}`] : []),
      ...formatInsights(item.insights),
    );
  }
  lines.push("", value.timingScope, value.conclusion);
  return lines.join("\n");
}

function help() {
  return `Honest invoice A/B demo runner

Usage:
  node demo/run.js prepare [--id ID] [--existing-project] [--parallel] [--json]
  node demo/run.js worktrees --trial ID [--json]
  node demo/run.js attach A|B WORKSPACE --session ID --trial ID [--json]
  node demo/run.js start A|B --trial ID [--copilot | --json]
  node demo/run.js check A|B --trial ID [--json]
  node demo/run.js feedback A|B --trial ID [--copilot]
  node demo/run.js resume A|B --trial ID [--copilot]
  node demo/run.js twtty B --trial ID [--copilot | --json]
  node demo/run.js mark-incomplete A|B --reason TEXT --trial ID
  node demo/run.js insights A|B --provenance TEXT --reference TEXT [metrics...] --trial ID
  node demo/run.js compare --trial ID [--json]

Use --state PATH instead of --trial ID after prepare. "record" aliases "insights".
prepare creates only a source repository; it never launches an agent or CLI.`;
}

function preflightCopilot(state, lane, flags) {
  if (flags.json) throw new CliError("--copilot cannot be combined with --json");
  const record = state.lanes[lane];
  if (!record.workspace) throw new CliError(`attach lane ${lane} before launching Copilot`);
  exactRealDirectory(record.workspace, `lane ${lane} workspace`);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(record.sessionId || "")) {
    throw new CliError("Copilot requires a UUID session ID; prepare a new CLI trial with worktrees");
  }
  const help = run("copilot", ["--help"]);
  if (help.status !== 0) {
    throw new CliError(`Copilot CLI is unavailable: ${help.error || help.stderr || help.stdout}`, 1);
  }
  for (const flag of [
    "--prompt", "--session-id", "--model", "--reasoning-effort", "--context",
    "--allow-all", "--no-ask-user", "--usage-output-file",
  ]) {
    if (!help.stdout.includes(flag)) throw new CliError(`installed Copilot CLI does not support ${flag}`);
  }
}

function launchCopilot(state, lane, prompt) {
  const record = state.lanes[lane];
  const usageFile = path.join(state.trialRoot, `usage-${lane}-${crypto.randomUUID()}.json`);
  process.stdout.write(`Running lane ${lane}: gpt-5.6-sol, high, long_context, --allow-all\n`);
  const result = spawnSync("copilot", [
    "-C", record.workspace,
    "--session-id", record.sessionId,
    "--model", "gpt-5.6-sol",
    "--reasoning-effort", "high",
    "--context", "long_context",
    "--allow-all", "--no-ask-user",
    "--usage-output-file", usageFile,
    "--prompt", prompt,
  ], { cwd: record.workspace, stdio: "inherit" });
  const exitCode = result.status ?? 1;
  state.events.push({
    type: "copilot",
    lane,
    at: now(),
    sessionId: record.sessionId,
    usageFile,
    usageRecorded: fs.existsSync(usageFile),
    exitCode,
    signal: result.signal || null,
  });
  writeState(state);
  if (exitCode !== 0) {
    throw new CliError(
      `Copilot exited with status ${exitCode}${result.error ? `: ${result.error.message}` : ""}. ` +
      `Lane ${lane} remains running; use resume after resolving the error.`,
      exitCode,
    );
  }
}

function output(value, json) {
  if (json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else if (typeof value === "string") process.stdout.write(`${value}\n`);
  else {
    for (const [key, item] of Object.entries(value)) {
      process.stdout.write(`${key}=${typeof item === "string" ? item : JSON.stringify(item)}\n`);
    }
  }
}

function main(argv = process.argv.slice(2)) {
  const { positionals, flags } = parseArgs(argv);
  const command = flags.help ? "help" : positionals[0] || "help";
  if (command === "help" || command === "--help" || command === "-h") {
    assertAllowedFlags(flags, ["help"]);
    output(help(), false);
    return;
  }
  if (command === "prepare") {
    assertAllowedFlags(flags, ["id", "json", "parallel", "existing-project"]);
    if (positionals.length !== 1) throw new CliError("prepare takes no positional arguments");
    output(prepare(flags), flags.json);
    return;
  }

  const state = readState(flags);
  if (command === "worktrees") {
    assertAllowedFlags(flags, ["state", "trial", "json"]);
    if (positionals.length !== 1) throw new CliError("worktrees takes no positional arguments");
    withLock(`${state.statePath}.A.lock`, () =>
      withLock(`${state.statePath}.B.lock`, () =>
        output(createWorktrees(readState(flags)), flags.json)));
    return;
  }
  if (command === "compare") {
    assertAllowedFlags(flags, ["state", "trial", "json"]);
    if (positionals.length !== 1) throw new CliError("compare takes no positional arguments");
    const value = compare(state);
    output(flags.json ? value : printComparison(value), flags.json);
    return;
  }

  const lane = requireLane(positionals[1]);
  withLock(`${state.statePath}.${lane}.lock`, () =>
    runLaneCommand(command, lane, positionals, flags, readState(flags)));
}

function runLaneCommand(command, lane, positionals, flags, state) {
  if (command === "attach") {
    assertAllowedFlags(flags, ["state", "trial", "session", "json"]);
    if (positionals.length !== 3) throw new CliError("attach requires A|B and WORKSPACE");
    output(attach(state, lane, positionals[2], flags.session), flags.json);
  } else if (command === "start") {
    assertAllowedFlags(flags, ["state", "trial", "json", "copilot"]);
    if (positionals.length !== 2) throw new CliError("start requires A|B");
    if (flags.copilot) preflightCopilot(state, lane, flags);
    const started = startLane(state, lane);
    if (flags.copilot) launchCopilot(state, lane, started.prompt);
    else output(started, flags.json);
  } else if (command === "check") {
    assertAllowedFlags(flags, ["state", "trial", "json"]);
    if (positionals.length !== 2) throw new CliError("check requires A|B");
    const result = checkLane(state, lane);
    if (flags.json) {
      output(
        {
          attempt: result.attempt,
          fullOutput: result.full.stdout + result.full.stderr,
          acceptanceOutput: result.acceptance.stdout + result.acceptance.stderr,
        },
        true,
      );
    } else {
      process.stdout.write(`--- npm test (${result.full.elapsedMs}ms, exit ${result.full.status}) ---\n`);
      process.stdout.write(result.full.stdout + result.full.stderr);
      process.stdout.write(
        `\n--- independent acceptance (${result.acceptance.elapsedMs}ms, exit ${result.acceptance.status}) ---\n`,
      );
      process.stdout.write(result.acceptance.stdout + result.acceptance.stderr);
      process.stdout.write(
        `\ncheck_passed=${result.attempt.passed} data_preserved=${result.attempt.data.acceptancePreservedData}\n`,
      );
    }
    if (!result.attempt.passed) process.exitCode = 1;
  } else if (command === "feedback") {
    assertAllowedFlags(flags, ["state", "trial", "copilot"]);
    if (positionals.length !== 2) throw new CliError("feedback requires A|B");
    const prompt = feedback(state, lane);
    if (flags.copilot) {
      if (state.lanes[lane].status !== "running" || state.lanes[lane].attempts.at(-1)?.passed) {
        throw new CliError("Copilot feedback requires a running lane with an actual failed check");
      }
      preflightCopilot(state, lane, flags);
      launchCopilot(state, lane, prompt);
    } else output(prompt, false);
  } else if (command === "resume") {
    assertAllowedFlags(flags, ["state", "trial", "copilot"]);
    if (positionals.length !== 2) throw new CliError("resume requires A|B");
    if (state.lanes[lane].status !== "running") throw new CliError(`lane ${lane} is not running`);
    const prompt = "Continue implementing the feature in FEATURE-REQUEST.md from the current state. " +
      "Preserve existing work, run the checks, and work only in this repository.";
    if (flags.copilot) {
      preflightCopilot(state, lane, flags);
      launchCopilot(state, lane, prompt);
    } else output(prompt, false);
  } else if (command === "twtty") {
    assertAllowedFlags(flags, ["state", "trial", "json", "copilot"]);
    if (positionals.length !== 2) throw new CliError("twtty requires B");
    if (flags.copilot) preflightCopilot(state, lane, flags);
    const intervention = twtty(state, lane);
    if (flags.copilot) launchCopilot(state, lane, intervention.prompt);
    else output(flags.json ? intervention : intervention.prompt, flags.json);
  } else if (command === "mark-incomplete") {
    assertAllowedFlags(flags, ["state", "trial", "reason", "json"]);
    if (positionals.length !== 2) throw new CliError("mark-incomplete requires A|B");
    output(markIncomplete(state, lane, flags.reason), flags.json);
  } else if (command === "insights" || command === "record") {
    assertAllowedFlags(flags, [
      "state",
      "trial",
      "json",
      "provenance",
      "reference",
      "model",
      "cost-value",
      "cost-unit",
      "ai-credit-value",
      "ai-credit-unit",
      "input-tokens",
      "output-tokens",
      "cache-read-tokens",
      "cache-write-tokens",
      "api-calls",
      "model-runtime-seconds",
    ]);
    if (positionals.length !== 2) throw new CliError(`${command} requires A|B`);
    output(recordInsights(state, lane, flags), flags.json);
  } else {
    throw new CliError(`unknown command: ${command}\n\n${help()}`);
  }
}

if (require.main === module) {
  for (const [signal, exitCode] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    process.once(signal, () => {
      for (const file of [...heldLocks.keys()]) releaseLock(file);
      process.exit(exitCode);
    });
  }
  try {
    main();
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = error.exitCode || 1;
  }
}

module.exports = {
  AS_OF,
  FEATURE_PROMPT,
  CliError,
  compare,
  feedback,
  main,
  parseArgs,
  prepare,
  validateWorkspace,
};
