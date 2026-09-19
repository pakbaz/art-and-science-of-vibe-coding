# Live A/B demo: overdue invoices

This is an honest, repeatable comparison of two real coding-agent sessions
starting from the same invoice application commit.

- **A** gets a normal repository and the short feature prompt. It may still
  receive globally injected user instructions and tool grants from the host.
- **B** gets the same commit and prompt, plus a documented `AGENTS.md` workflow,
  a curated 100-row fixture, and `npm run test:fast`.
- Both must pass the repository's full test command and an external acceptance
  suite. A run does not finish when an agent says it is done.

Nothing here guarantees B will win. Report incomplete runs and non-comparable
metrics as such.

## Requirements

- Node.js and Git
- No npm install and no external packages
- Two real child sessions created by the presenter with identical model,
  reasoning, and tool grants

## Runner contract

```bash
node demo/run.js help
node demo/run.js prepare --id rehearsal-01 --json
node demo/run.js attach A /absolute/worktree/A --session SESSION_A --trial rehearsal-01
node demo/run.js attach B /absolute/worktree/B --session SESSION_B --trial rehearsal-01
node demo/run.js start A --trial rehearsal-01
node demo/run.js check A --trial rehearsal-01
node demo/run.js feedback A --trial rehearsal-01
node demo/run.js mark-incomplete A --reason "bounded retry limit reached" --trial rehearsal-01
node demo/run.js start B --trial rehearsal-01
node demo/run.js check B --trial rehearsal-01
node demo/run.js twtty B --trial rehearsal-01
node demo/run.js insights A --trial rehearsal-01 \
  --provenance "child session Insights" --reference "SESSION_A" \
  --model "MODEL" --ai-credit-value 12.3 --ai-credit-unit AIU \
  --input-tokens 1000 --output-tokens 500 --cache-read-tokens 300 \
  --api-calls 8 --model-runtime-seconds 42.1
node demo/run.js compare --trial rehearsal-01
```

`record` is an alias for `insights`; `--state /absolute/path/state.json` can
replace `--trial ID`.

### `prepare`

Creates a unique ignored directory at `demo/.runs/<id>` and an app-only Git
repository in `source/`. The source history contains only the baseline app,
README, and complete `FEATURE-REQUEST.md`. It has no gate, prep, results, deck,
or opposite lane. Existing trials are never overwritten.

`--json` prints absolute `sourceRepo` and `statePath` values for orchestration.
The command does not launch an agent or create an app child session.

The exact JSON fields are:

```json
{
  "trialId": "<id>",
  "sourceRepo": "<absolute app-only repository path>",
  "statePath": "<absolute persistent state path>",
  "baseCommit": "<40-character commit>",
  "prompt": "<exact shared kickoff prompt>"
}
```

### `attach`

Registers an externally created, pristine Git worktree of that exact source
repository and commit. It rejects the source repository itself, dirty trees,
wrong commits, unrelated repositories, duplicate lane paths, and symlinked
paths. The same child session ID cannot be attached to both lanes. B's
documented workflow and fixture support are overlaid only now, and its setup
time is recorded separately.

Worktrees isolate checked-out changes; they are not security sandboxes. They
share Git object/history storage and do not prevent tools from reading other
filesystem paths. The app-only source repository has no parent presentation
repository in its commit history, and the identical kickoff prompt explicitly
restricts each child to its own repository. Host-injected user instructions and
available tools can still influence both lanes, so do not describe A as having
“zero instructions.”

For a CLI-only rehearsal, `worktrees` creates any missing A/B worktrees from the
same commit. It never duplicates an attached lane.

### `start`, `check`, and `feedback`

`start` records wall-clock time immediately before the presenter sends the
returned short prompt. A and B must run sequentially.

`check` always runs:

1. the repository's full `npm test`; and
2. the external acceptance suite through a real ephemeral HTTP server.

Before `npm test`, the runner verifies the prepared full-test and seed scripts,
their lifecycle hooks, every original regression-test hash, the generator hash,
and the lane-specific store hash. Added tests and extra fast commands are
allowed; deleting or weakening the original full path blocks the command. The
full environment removes inherited `INVOICE_*` controls, then sets
`INVOICE_COUNT=400000`, clears the fixture override, and verifies that the
generated file actually contains 400,000 rows.

The external suite uses `buildApp` with an in-memory fixture and never copies
test code or rewrites data inside the app. Full TAP logs, elapsed time per
command, data hashes, and every attempt persist under the trial. The clock stops
only when both checks pass. `feedback` prints only failures actually observed.
Use `mark-incomplete` after a bounded stagnation policy so the next lane can
start; an incomplete lane has no pass time.

### Conditional TWTTY

`twtty B` is rejected until B has an actual failed check. It names the measured
slowest command, includes observed missing checks, requests the smallest safe
change, and opens a timed intervention window closed by the next `check`. Do not
describe a historical run as TWTTY-optimized unless this intervention actually
occurred in that run. TWTTY may optimize the inner loop, but B must still pass
the unchanged full `npm test` and independent acceptance gate.

### Insights and comparison

Copy values manually from each real child session's Insights panel. Missing
values remain `null`, never zero. Currency cost, AI credits, tokens, API calls,
model runtime, and wall time remain separate fields with provenance. `compare`
shows completion, time to actual pass, iterations, active command time, B
workspace-overlay time, measured workspace-preparation totals, interventions,
and Insights. It never declares a winner and never compares different units.

`sourcePreparationMs` measures source materialization and the initial Git commit.
Lane `setupMs` measures worktree registration and, for B, overlay copying. These
do **not** measure authoring the reusable B preparation or provisioning the host
project and child sessions. Accordingly:

- `preparationTimingScope` is
  `workspace materialization/overlay only; authoring and host-session provisioning not measured`;
- unmeasured authoring and provisioning fields remain `null`;
- `totalIncludingWorkspacePreparationMs` includes only measured
  materialization/overlay plus run wall time; and
- `endToEndTotalMs` remains `null`.

Do not present the measured workspace sum as an all-in total or infer end-to-end
savings while authoring and provisioning remain unknown.

Wall time includes model work, commands, feedback round trips, and presenter or
user pauses between `start` and a passing `check`.

Exact optional Insights flags:

```text
--model
--cost-value --cost-unit
--ai-credit-value --ai-credit-unit
--input-tokens --output-tokens
--cache-read-tokens --cache-write-tokens
--api-calls
--model-runtime-seconds
```

`--provenance` and `--reference` are required.

## Presenter flow

1. Run `prepare --json`.
2. Use the app's `create_project` API on `sourceRepo`.
3. Create two idle worktree child sessions from that project with identical
   settings. Because `create_session` cannot select a model without a kickoff,
   explicitly select and verify the same model in both fresh idle sessions
   before either `start`.
4. Attach their absolute workspace paths and session IDs.
5. Start and finish A, then start and finish B.
6. After each failed check, send exactly the generated `feedback`.
7. Use a bounded retry/stagnation rule; mark a lane incomplete honestly.
8. If B genuinely struggles, optionally run `twtty B` and send its prompt.
9. Copy each child session's Insights into `insights`.
10. Run `compare`.

The copyable main-session orchestration prompt is
[`prompts/main-session-orchestration.md`](prompts/main-session-orchestration.md).

## What acceptance covers

- the conventional business rule: only `SENT` and strictly before as-of
- valid leap-day and date boundaries
- composition with `q`, `status`, and `customer`
- 25-row pagination and query preservation
- checkbox rendering and checked state
- filtered count and all-page outstanding total
- amount formatting and HTML escaping regressions
- a real built-in Node HTTP smoke request

It does **not** claim browser automation, authentication, accessibility, visual
layout quality, production scale performance, or real customer data.

## Files

| Path | Purpose |
| --- | --- |
| `baseline/` | Unimplemented starting application |
| `FEATURE-REQUEST.md` | Complete byte-identical feature specification |
| `prep/` | B-only workflow and fixture support; no completed feature |
| `gate/acceptance.test.js` | External, non-mutating final acceptance |
| `run.js` | Persistent zero-dependency experiment runner |
| `test/run.test.js` | Runner and red/green acceptance tests |
| `results/` | Historical, explicitly non-comparable records |

`scripts/setup-runs.sh` and `scripts/run-gate.sh` are compatibility entry points
for the runner; neither performs destructive directory copying.
