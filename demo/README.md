# Live A/B demo: overdue invoices

This is an honest comparison of two coding-agent sessions starting from the
same invoice application commit.

- **A** gets the baseline repository and shared feature request.
- **B** gets the same commit and request, plus `AGENTS.md`, a curated 100-row
  fixture, and `npm run test:fast`.
- Both must pass the protected full test path and the same independent
  feature/HTTP gate. An agent saying it is done is not a pass.

Better preparation is the hypothesis, not a guarantee that B wins. Report
incomplete runs and unknown or non-comparable metrics honestly.

## Requirements and safety

- Node.js, npm, and Git; the demo has no external packages to install
- A host that can create nested worktree sessions for the app workflow
- An authenticated Copilot CLI for the terminal workflow
- The same model, reasoning, context, and actual host grants for both lanes

Worktrees isolate changes, not filesystem access or machine resources. Parallel
lanes share CPU, disk, and network, so they are useful for a live side-by-side
demo but not a controlled latency benchmark. Prefer the default sequential mode
for a cleaner time comparison; use `--parallel` when both should work at once.

`--allow-all` lets the Copilot CLI shell use all available tools, paths, and
URLs. Use it only in a trusted environment. It does not bypass authentication,
organization or service policy, or sandbox boundaries. Putting `--allow-all`
in an app-chat prompt grants nothing; give both app sessions equal real host
permissions and surface any required user action.

## Recommended: prompts for the MAIN chat

Paste these prompts into **MAIN**, not A or B. MAIN coordinates but never
implements. The detailed rules and app API specifics live in
[`prompts/main-session-orchestration.md`](prompts/main-session-orchestration.md).

### 1. Prepare two fresh sessions

```text
Prepare a completely new parallel invoice A/B trial. First read
demo/prompts/main-session-orchestration.md and follow its setup contract exactly.
Coordinate only in MAIN; do not implement the feature or start either timer.
Create the app-only project and two NEW NESTED worktree sessions from one commit.
Give both GPT-5.6 Sol, high reasoning, long_context, and equal real host grants.
Use the contract's identical readiness kickoff; wait idle and verify pristine.
Attach their actual IDs and paths, applying the preparation only to B.
Never reuse deleted sessions, worktrees, IDs, or branches.
Return the trial ID, child links, paths, verification, and any manual action.
```

Readiness turns are setup activity and may be included in session-wide
Insights. Do not claim otherwise unless the host exposes a separate split.

### 2. Start A

Replace `<TRIAL_ID>` with the new trial ID.

```text
For trial <TRIAL_ID>, follow the contract to start A. Start its timer
immediately before sending this exact prompt to the new A child:

Add the overdue-invoices feature in FEATURE-REQUEST.md. Make it work and check it.
Work only in this repository.

Add no coaching, do not implement in MAIN or expose the gate, and return
immediately after delivery with the child link and runner status.
```

### 3. Start B in parallel

```text
For trial <TRIAL_ID>, start B now under the contract; do not wait for A.
Start its timer immediately before sending this exact prompt to the new B child:

Add the overdue-invoices feature in FEATURE-REQUEST.md. Make it work and check it.
Work only in this repository.

Add no coaching, do not implement in MAIN or expose the gate, and return
immediately after delivery with the child link and runner status.
```

### 4. Check and fix both

```text
Check both lanes for trial <TRIAL_ID> under the contract. Monitor independently
and wait for each child to become idle before checking its worktree. Run the
same protected 400,000-invoice full test and independent feature/HTTP gate;
never reveal its source. Send exact generated failures to the same child with
no extra coaching, then recheck when idle. Mark genuine stagnation incomplete.
Use TWTTY for B only after a real failed check and genuine stall. Continue until
both lanes pass or are honestly marked incomplete.
```

### 5. Report observed results

```text
Finish trial <TRIAL_ID> under the contract using only these two new children.
Record real Insights with exact units and provenance, then compare completion,
corrections, wall time, active command time, and observed cost or credits.
Keep workspace/readiness setup separate; do not call it end-to-end or claim
session-wide Insights excludes it. Leave unknowns null, never invent or compare
unlike values, and do not imply B must win. If Insights is inaccessible, ask me
for the real displayed values.
```

## Portable terminal workflow

This path runs real Copilot CLI sessions; it does not create nested app
sessions. `worktrees` creates or attaches separate CLI worktrees and reserves
distinct session UUIDs. The actual sessions begin at `start --copilot`.

### 1. Prepare a fresh parallel trial

From the repository root:

```bash
node demo/run.js prepare --parallel --json
node demo/run.js worktrees --trial PASTE_NEW_TRIAL_ID --json
```

Copy the new `trialId` printed by `prepare` into the second command. The
`worktrees` JSON identifies both paths and their distinct reserved UUIDs.

### 2. Start both terminals

Variables do not transfer between terminals. Set the **same new trial ID**
separately in each.

Terminal A:

```bash
TRIAL_ID='PASTE_THE_SAME_NEW_TRIAL_ID'
node demo/run.js start A --trial "$TRIAL_ID" --copilot
node demo/run.js check A --trial "$TRIAL_ID"
```

Terminal B:

```bash
TRIAL_ID='PASTE_THE_SAME_NEW_TRIAL_ID'
node demo/run.js start B --trial "$TRIAL_ID" --copilot
node demo/run.js check B --trial "$TRIAL_ID"
```

Either lane may start first. Run both `start` commands at about the same time.
Each starts its timer, launches `copilot -p` in its worktree, and returns to the
shell when the turn ends. Both use `gpt-5.6-sol`, high reasoning,
`long_context`, `--allow-all`, `--no-ask-user`, their reserved UUID, and a
unique usage JSON path.

Only `check_passed=true` is a pass.

### 3. Handle failures or interruption

After a failed check, send its exact failure to the same CLI session and check
again:

```bash
node demo/run.js feedback A --trial "$TRIAL_ID" --copilot
node demo/run.js check A --trial "$TRIAL_ID"
```

Use `B` in B's terminal. Resume an interrupted active lane without resetting
its timer:

```bash
node demo/run.js resume A --trial "$TRIAL_ID" --copilot
```

For B only, after a real failed check and genuine stagnation:

```bash
node demo/run.js twtty B --trial "$TRIAL_ID" --copilot
node demo/run.js check B --trial "$TRIAL_ID"
```

After a bounded retry limit, record the blocker:

```bash
node demo/run.js mark-incomplete A \
  --reason "Describe the observed blocker" \
  --trial "$TRIAL_ID"
```

### 4. Record Insights and compare

Use each lane's final CLI usage output or unique saved JSON. Do not sum
cumulative snapshots from resumes.

```bash
node demo/run.js insights A --trial "$TRIAL_ID" \
  --provenance "Copilot CLI usage output" \
  --reference "ACTUAL_SESSION_ID_OR_USAGE_JSON_PATH" \
  --model "gpt-5.6-sol" \
  --ai-credit-value ACTUAL_VALUE \
  --ai-credit-unit ACTUAL_UNIT

node demo/run.js compare --trial "$TRIAL_ID"
```

Repeat `insights` for B with B's observed values. Omit unavailable flags so
their values remain `null`.

## Runner reference

```text
node demo/run.js help
node demo/run.js prepare [--id ID] [--parallel] [--json]
node demo/run.js worktrees --trial ID --json
node demo/run.js attach A|B WORKTREE --session SESSION_ID --trial ID
node demo/run.js start A|B --trial ID [--copilot]
node demo/run.js check A|B --trial ID
node demo/run.js feedback A|B --trial ID [--copilot]
node demo/run.js resume A|B --trial ID [--copilot]
node demo/run.js twtty B --trial ID [--copilot]
node demo/run.js mark-incomplete A|B --reason TEXT --trial ID
node demo/run.js insights A|B --trial ID [metric flags]
node demo/run.js compare --trial ID
```

`record` aliases `insights`. `--state /absolute/path/state.json` can replace
`--trial ID` where supported.

### Setup and isolation

`prepare` creates a unique ignored `demo/.runs/<id>` directory and app-only Git
repository containing the baseline, README, and feature request—not the gate,
prep, results, deck, or opposite lane. Existing trials are never overwritten.

Default mode enforces A then B. `--parallel` allows either to start first and
both to remain active; shared-state and per-lane locks protect concurrent state.

`prepare --json` reports the trial ID, source and state paths, base commit, and
shared prompt. It creates no project, child session, worktree, or agent.

`worktrees --trial ID --json` creates or attaches the CLI worktrees, reserves a
distinct valid UUID per lane, and applies the prep overlay only to B. It does
not launch Copilot.

`attach` registers an external pristine app worktree at the source commit. It
rejects the source repository, dirty/unrelated trees, wrong commits,
duplicate/symlinked paths, and reused session IDs. B's overlay is applied and
timed during attachment.

The source has no presentation-repository history, but host-injected
instructions and tools can still affect both lanes; A is not "instruction-free."

### Running and checking

Without `--copilot`, `start` starts the timer and prints the prompt; it does not
message or create an app session. Other raw commands likewise print their next prompt.

With `--copilot`, those commands invoke the real CLI with the fixed settings,
reserved lane UUID, and unique usage path. Follow-ups stay in the same session.
`resume` preserves the running lane's timer.

`twtty B` requires a real failed check. It reports the measured slowest command
and missing checks, asks for the smallest safe change, and opens an intervention
window closed by the next check. It is optional and never replaces final checks.

Every `check` runs protected `npm test` with 400,000 generated invoices and the
independent suite through an ephemeral HTTP server. It verifies scripts, hooks,
original regression hashes, generator/store hashes, environment controls, and
row count. Adding tests is allowed; weakening the original path blocks the check.

The external suite uses an in-memory fixture and does not copy gate source or
rewrite app data. TAP logs, timings, hashes, and attempts persist under the
trial. A lane's timer stops only after both checks pass; `mark-incomplete`
records no pass time.

### Metrics

For app runs, use the correct new child's Insights. For CLI runs, use that
lane's final output and unique usage JSON. Never mix app and CLI metrics or add
cumulative snapshots from one resumed session.

`--provenance` and `--reference` are required. Optional flags are:

```text
--model
--cost-value --cost-unit
--ai-credit-value --ai-credit-unit
--input-tokens --output-tokens
--cache-read-tokens --cache-write-tokens
--api-calls
--model-runtime-seconds
```

Use cost fields only for currency and credit fields only for credits. Missing
values stay `null`. Keep currency, credits, tokens, calls, model runtime, wall
time, and their units distinct.

`compare` reports completion, verified-pass time, iterations, active command
time, interventions, B overlay time, workspace preparation, and Insights. It
does not declare a winner.

`sourcePreparationMs` covers source materialization and the initial commit.
Lane `setupMs` covers worktree registration and B's overlay. Neither includes
prep authoring or host provisioning, and readiness usage may appear in
session-wide Insights. Report these separately, leave unmeasured values and
`endToEndTotalMs` null, and do not present
`totalIncludingWorkspacePreparationMs` as an all-in total.

Wall time includes model work, commands, feedback round trips, and presenter or
user pauses between `start` and a passing `check`.

## Acceptance scope

The gate covers the conventional overdue rule (`SENT` and strictly before
as-of), leap-day and date boundaries, composition with search/status/customer
filters, 25-row pagination, query preservation, checkbox state, filtered count,
all-page totals, formatting/escaping regressions, and a real built-in Node HTTP
smoke request.

It does not claim browser automation, authentication, accessibility, visual
quality, production-scale performance, or real customer data.

## Files

| Path | Purpose |
| --- | --- |
| `baseline/` | Unimplemented starting application |
| `FEATURE-REQUEST.md` | Shared feature specification |
| `prep/` | B-only workflow and fixture; no completed feature |
| `gate/acceptance.test.js` | External, non-mutating acceptance |
| `run.js` | Persistent zero-dependency runner |
| `test/run.test.js` | Runner and acceptance regression tests |
| `results/` | Historical, explicitly non-comparable records |
