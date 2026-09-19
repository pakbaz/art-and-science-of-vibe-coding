# The Art and Science of Vibe Coding

A presentation and hands-on demo about getting reliable results from coding
agents.

The central idea: **the model is the brain, the harness is the body, and your
setup gives them the context, tools, and feedback needed to do useful work.**

## Presentation

[Open the PowerPoint presentation](deck/Art-and-Science-of-Vibe-Coding-v3.pptx).

The deck covers model and harness selection, focused context, durable session
state, permissions, test feedback loops, TWTTY ("Tell me What To Tell You"),
regression tests, repository instructions, and delegation.

Speaker notes include the talk track, source references, animation cues, and
the live demo runbook. Use slideshow mode for the animated reveals.

## The demo

Two coding-agent sessions implement the same overdue-invoices feature in a
small, server-rendered Node.js application.

| | Run A: vibe coding | Run B: prepared setup |
| --- | --- | --- |
| Starting point | Baseline application | Same application commit |
| Request | Short prompt and complete feature specification | Same prompt and specification |
| Repository setup | Baseline instructions and full tests | Added `AGENTS.md`, a 100-row fixture, and fast tests |
| Feedback | Actual failures followed by correction prompts | Fast feedback, with TWTTY if the loop genuinely stalls |
| Finish line | Full tests and independent feature/HTTP checks | The same checks |

Use the same model, reasoning settings, harness, and tool grants. Each session
works in a separate Git worktree. Run A first, then B.

Compare time to a verified pass, correction rounds, and observed session
Insights metrics. Report preparation separately. **Better preparation is the
hypothesis, not a guaranteed win for B.**

### Try the baseline application

You need Node.js and npm. The application uses built-in Node.js modules and
requires no dependency installation.

From the repository root:

```bash
cd demo/baseline
npm test
npm start
```

`npm test` generates 400,000 synthetic invoices and runs the full test suite.
Open <http://localhost:3000/invoices> after starting the server. The baseline
deliberately does not implement the requested overdue feature.

### Run the A/B experiment

You also need Git and a coding-agent host that can create two independent
worktree sessions.

From the repository root:

```bash
node demo/run.js help
node demo/run.js prepare --id rehearsal-01 --json
```

Choose a fresh trial ID for each experiment. `prepare` creates an app-only
source repository; it does not create or start agent sessions.

Follow the [presenter guide](demo/README.md#presenter-flow) to create and attach
the sessions, run each lane, record real failures, and enter Insights values.
The [copyable orchestration prompt](demo/prompts/main-session-orchestration.md)
provides the same workflow for a coordinating agent.

The runner prints prompts for you to send to the child sessions. It records
completion only after the shared checks pass, not when an agent says "done."

## Reading the results

- Missing metrics are unknown, not zero. Keep currency, credits, tokens, and
  model runtime in their own units.
- Wall time includes agent work, commands, corrections, and presenter pauses.
- Workspace preparation timing does not include authoring the setup or
  provisioning the host sessions. It is not an all-in cost.
- Git worktrees isolate edits, not filesystem access. Both sessions may still
  receive global host instructions.
- The HTTP check is not a browser, authentication, accessibility, or load test.
- The [archived results](demo/results/README.md) belong to an earlier experiment
  and are not comparable to this demo.

## Repository layout

| Path | Purpose |
| --- | --- |
| [`deck/`](deck/) | PowerPoint presentation with speaker notes |
| [`demo/README.md`](demo/README.md) | Runner commands and presenter workflow |
| [`demo/FEATURE-REQUEST.md`](demo/FEATURE-REQUEST.md) | Shared feature requirements |
| [`demo/baseline/`](demo/baseline/) | Starting invoice application |
| [`demo/prep/`](demo/prep/) | Run B instructions and fast-test setup |
| [`demo/gate/`](demo/gate/) | Independent acceptance checks |
| [`demo/test/`](demo/test/) | Runner and acceptance regression tests |

Run the demo runner's regression tests from the repository root:

```bash
node --test demo/test/run.test.js
```
