# The Art and Science of Vibe Coding

A presentation and hands-on demonstration of getting reliable results from
coding agents.

The central idea: **the model is the brain, the harness is the body, and your
setup gives them the context, tools, and feedback needed to do useful work.**

## Presentation

[Open the PowerPoint presentation](deck/Art-and-Science-of-Vibe-Coding-v4.pptx).

The deck introduces attention, context windows, and reasoning models before
the agentic loop. It then covers model and harness selection, focused context,
durable session state, permissions, test feedback loops, TWTTY ("Tell me What
To Tell You"), regression tests, repository instructions, and delegation.
Speaker notes contain the talk track and live-demo cues.

## Live A/B demo

Two new coding-agent sessions implement the same overdue-invoices feature from
the same app-only commit in separate Git worktrees. The orchestrator and both
nested sessions stay in this existing project; no timestamped projects are
created.

| | A: baseline | B: prepared |
| --- | --- | --- |
| Request | Shared short prompt and full feature specification | Exactly the same |
| Added setup | None beyond the baseline | `AGENTS.md`, curated fixture, fast-test command |
| Finish line | Protected full tests plus independent feature/HTTP gate | Exactly the same |

Run the lanes sequentially for a cleaner time comparison or explicitly choose
parallel mode for a live side-by-side demonstration. Parallel runs share CPU,
disk, and network and are not controlled latency benchmarks. Preparation is a
hypothesis, not a guarantee that B wins.

The primary guide contains the copyable **natural-language MAIN-chat prompt
series first**, followed by the portable two-terminal CLI workflow and complete
runner contract:

**[Open the live demo guide](demo/README.md).**

Quickstart:

1. App workflow: paste [the one-prompt orchestrator launch](demo/README.md#one-prompt-run-through-a-new-orchestrator)
   into MAIN, or use the guide's separate setup/start/check/report prompts.
2. CLI workflow: run `node demo/run.js prepare --existing-project --parallel --json`, copy its new
   `trialId`, run `worktrees`, then use that same ID in two terminals as shown
   in [the terminal guide](demo/README.md#portable-terminal-workflow).
3. Treat only `check_passed=true` as a pass. Report incomplete lanes and unknown
   metrics honestly.

The single-document
[coordinator contract](demo/prompts/main-session-orchestration.md) is available
when a presenter prefers one comprehensive MAIN-chat instruction.
[The cleanup prompt](demo/README.md#6-clean-up-this-run) preserves results before
removing the completed run's sessions and worktrees.

## Try the baseline application

The app uses built-in Node.js modules and requires no dependency installation.

```bash
cd demo/baseline
npm test
npm start
```

`npm test` generates 400,000 synthetic invoices and runs the full test suite.
Open <http://localhost:3000/invoices> after starting the server. The baseline
deliberately does not implement the requested overdue feature.

## Reading results safely

- `--allow-all` permits Copilot CLI tool, path, and URL access; use it only in a
  trusted environment. It does not bypass authentication, organization or
  service policy, or sandbox boundaries.
- A chat prompt cannot grant app permissions. Use the same actual host grants
  for both app sessions and surface required user action.
- Worktrees isolate edits, not filesystem access or machine resources.
- Missing metrics are unknown, not zero. Keep currency, credits, tokens, model
  runtime, wall time, and setup in their own units and scopes.
- Readiness turns may appear in session-wide Insights. Workspace preparation is
  not an end-to-end cost.
- The HTTP gate is not a browser, authentication, accessibility, or load test.
- [Archived results](demo/results/README.md) are from an earlier experiment and
  are not comparable to a new run.

## Repository layout

| Path | Purpose |
| --- | --- |
| [`deck/`](deck/) | Presentation with speaker notes |
| [`demo/README.md`](demo/README.md) | Primary prompt-first demo guide and runner reference |
| [`demo/prompts/`](demo/prompts/) | Shared feature prompt and coordinator contract |
| [`demo/baseline/`](demo/baseline/) | Starting invoice application |
| [`demo/prep/`](demo/prep/) | B-only instructions and fast-test setup |
| [`demo/gate/`](demo/gate/) | Independent acceptance checks |
| [`demo/test/`](demo/test/) | Runner and acceptance regression tests |
