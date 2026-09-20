# MAIN-session coordinator contract

Copy the prompt below into the **MAIN** chat. All later start, check, correction,
and reporting requests also go to MAIN, never directly to A or B.

```text
Coordinate a fresh, honest parallel invoice A/B experiment. Do not implement
the feature in this MAIN session. Do not reuse old or deleted sessions,
worktrees, branches, trial IDs, or session IDs. A shell command may prepare
runner state or launch a Copilot CLI process, but it does not create nested app
sessions; use the host's real project/session tools for app sessions.

SETUP

1. Stay in the existing presentation project. Run
`node demo/run.js prepare --existing-project --parallel --json` with a new trial
ID. This creates a fresh app-only baseline branch in this same repository,
without switching or changing the coordinator's checkout. Record `baseBranch`
and `baseCommit`. Never call `create_project` or register a timestamped source
directory as another project. `sourceRepo` is the coordinator's existing
checkout, not a new project.

2. Create two NEW NESTED worktree sessions, clearly named A and B, from the same
baseline commit. Use `create_session` with `workspace_type: "worktree"` and
`base_branch` set to the exact returned `baseBranch` for EACH child. Omit
`project_id` to inherit the coordinator's project, or explicitly use that same
project ID. Never use a source-directory project ID. If MAIN delegated this
contract to an orchestrator, that orchestrator creates both children so the
hierarchy is MAIN -> orchestrator -> A/B, all within one project.

Both must use GPT-5.6 Sol, high reasoning, `long_context`, interactive mode,
and the same actual host tool grants.

`create_session` can set a model only inside a kickoff. Therefore use this
identical short read-only readiness kickoff for both:

"Confirm your working directory only. Do not implement or investigate the
feature, read feature files, run tests, or edit files. Reply ready and stop."

Wait until both are idle, verify both worktrees remain pristine and share the
source commit, and only then attach the real workspace paths and session IDs:

`node demo/run.js attach A <absolute-A-path> --session <actual-A-id> --trial <id>`
`node demo/run.js attach B <absolute-B-path> --session <actual-B-id> --trial <id>`

Attaching B applies the B-only preparation overlay. Do not apply it to A. Do
not implement the feature or start a timer during setup.

Do not invent a model-setting tool or blindly claim a configured model. Verify
settings only from facts the host exposes. If identical kickoff-based settings
are unavailable, create both sessions idle and tell the presenter to select
and verify the same model manually before attachment. A prompt cannot grant
app permissions or bypass auth, organization/service policy, or sandbox
boundaries; use equal real host grants and surface required user action.

After setup, verify both children belong to the coordinator's existing project.
Return the actual clickable links, session IDs, absolute worktree paths, trial
ID, project ID, baseline branch, common commit, pristine-before-attach result,
and B-only overlay result. Readiness turns are setup overhead. Do not claim
session-wide Insights excludes them unless the host provides that split.

START CONTRACT

When asked to start A or B, run
`node demo/run.js start <LANE> --trial <id>` in MAIN immediately before sending
the exact returned prompt to that lane's newly created child. The shared prompt
must remain exactly:

Add the overdue-invoices feature in FEATURE-REQUEST.md. Make it work and check it.
Work only in this repository.

Do not add coaching. MAIN must not implement code. Return immediately after
delivery with the actual child link and runner status. In parallel mode, start
A and B independently and do not wait for A to finish or pass before starting
B. Never run a gate while its child may still be writing.

CHECK AND CORRECTION CONTRACT

When asked to "check both", monitor the two correct new children independently.
Wait until a lane is idle before running
`node demo/run.js check <LANE> --trial <id>` for its attached worktree. Both lanes must
pass the unchanged protected full test with 400,000 invoices and the same
independent feature/HTTP gate. Never reveal or copy the external gate source to
a child.

After an actual failed check, run
`node demo/run.js feedback <LANE> --trial <id>` and send its exact output to the
same child. Do not rewrite, summarize, improve, or supplement it with
task-specific coaching. Wait for that child to become idle and check again.
Keep A and B independent rather than serializing one behind the other.

If two consecutive attempts make no material progress, run
`mark-incomplete <LANE> --reason "<observed reason>" --trial <id>`. For B only,
`twtty B --trial <id>` is optional after an actual failed check and only if B
is genuinely stalled. Send its exact output. TWTTY never replaces the common
final checks and must not be used merely to favor B.

FINAL REPORT CONTRACT

Use only metrics belonging to these two newly created children. Record observed
Insights with `insights A|B`, preserving exact units and provenance for cost or
credits, tokens, cache reads, API calls, and model runtime. Missing values stay
null, never zero. If tools cannot access the real Insights display, ask the
presenter for those values; do not invent UI/API access or fabricate numbers.

Run `compare`. Report pass or incomplete state, correction rounds, verified
wall time, active command time, interventions, and Insights. Report source
materialization, worktree/B-overlay setup, and readiness activity separately.
Session-wide Insights may include readiness turns. Do not call the measured
workspace total an end-to-end cost, and leave unmeasured authoring, host
provisioning, and end-to-end values null. Do not compare unlike units or
guarantee, imply, or manufacture a B win.

Parallel lanes share CPU, disk, and network; describe them as a side-by-side
demonstration, not a controlled latency benchmark. Worktrees isolate changes,
not filesystem visibility or Git objects/refs. Each lane checks out only the
app and feature request from a parentless baseline commit, but other repository
refs remain accessible. Do not inspect other refs or worktrees, or claim the
gate is inaccessible. Both lanes may receive global host instructions, so do
not describe A as instruction-free.
```

After setup completes, the presenter's ordinary follow-up turns are:

```text
Start A for the new trial and return immediately after delivery.
```

```text
Start B for the new trial now; do not wait for A.
```

```text
Check both.
```

```text
Continue checking both under the same exact-feedback contract until each
passes or is honestly marked incomplete.
```

```text
Gather the real Insights for the two new children and produce the final
comparison. Keep setup separate and unknown values null.
```
