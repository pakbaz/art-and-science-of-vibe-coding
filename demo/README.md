# Live demo: add an overdue-invoices filter

A controlled A/B comparison you can run on stage. Two agents get the same
feature request against the same codebase. One works in the repository as it is.
The other works in a repository that has been prepared. A shared acceptance gate,
which neither agent is allowed to see, decides who actually finished.

Everything here is synthetic. There is no customer data and no production system.

---

## What is in this folder

| Path | What it is |
| --- | --- |
| `baseline/` | The brownfield invoice console. Server-rendered, no framework, no dependencies. It has filters, 25-row pagination, shared amount formatting and HTML escaping. It does **not** have an overdue filter. That is the feature. |
| `FEATURE-REQUEST.md` | The request handed to both runs, byte-identical. |
| `prep/` | Run B's preparation: `AGENTS.md`, the curated 100-case fixture and its builder, the fixture-aware `store.js`, and the `package.json` carrying `test:fast`. |
| `gate/acceptance.test.js` | The shared final gate. 11 tests. Lives outside both workspaces on purpose. |
| `scripts/setup-runs.sh` | Builds `runs/A` and `runs/B` from the same baseline. |
| `scripts/run-gate.sh` | Copies the gate into a workspace, runs it, records the result, removes it again. |
| `prompts/` | The canonical turn-1 prompt and the failure-feedback template. Both runs get identical wording. |
| `results/scoreboard.json` | The recorded trial from 18 September 2026, with its conditions and its gaps. |
| `results/scoreboard-trial1.json` | An earlier, weaker trial that stopped at "agent says done" instead of at the gate. Kept as a cautionary example. |

---

## The feature, and why it is a good demo

The request says "show me overdue invoices". It specifies the interface
(`GET /invoices?overdue=1`, combines with existing filters, `INVOICE_AS_OF` for
the as-of date) because a shared gate needs a stable surface to test.

It deliberately does **not** define which statuses still count as owed. That
single omission is the whole demo. An agent has to guess, and the plausible
guess is wrong.

The real rule, stated in run B's `AGENTS.md`:

> Overdue means `status` is neither `PAID` nor `CANCELLED`, **and** `dueDate` is
> strictly before the as-of date. An invoice due *on* the as-of date is not
> overdue yet.

A past-due `DRAFT` invoice is overdue. That is the case people miss.

---

## Running it

### 1. Build the two workspaces

```bash
cd demo
node prep/build-fixture.js      # only if you changed the fixture
./scripts/setup-runs.sh
```

`runs/A` is the baseline untouched. `runs/B` is the baseline plus preparation.
Neither contains the gate.

### 2. Prove the gate is red first

```bash
./scripts/run-gate.sh "$PWD/baseline" baseline-red-check
```

Expect 8 of 11 failing. The 3 that pass are regression guards for pagination,
amount formatting and escaping. Show this. A test that cannot fail proves
nothing, and this is the same discipline the session argues for.

### 3. Run A, then run B, and drive each one to green

Open two fresh agent sessions, same model, same harness, same reasoning setting.
Run them **sequentially, not in parallel**, or CPU contention will corrupt the
elapsed times. Use `prompts/turn-1.txt` for both, substituting the workspace
path. Nothing else about the prompt may differ.

**A run is finished when the shared gate passes, not when the agent says it is
done.** This is the part that is easy to get wrong. Loop:

1. Send the turn-1 prompt. Start the clock.
2. Run the gate (step 4 below).
3. If it fails, send `prompts/turn-n-failure.txt` with the gate output pasted in,
   and go back to step 2.
4. Stop the clock when the gate is green. Record the number of turns.

Do not mention the gate's existence or its source to either agent. Feed back only
what it printed, which is what a developer would see.

### 4. Run the shared gate

```bash
./scripts/run-gate.sh "$PWD/runs/A" A
./scripts/run-gate.sh "$PWD/runs/B" B
```

### 5. Measure AI usage

The local session store writes one `assistant_usage_events` row per API call,
including sub-agent calls, keyed by `agent_id`. AI units are `total_nano_aiu`
divided by a billion.

```sql
SELECT agent_id,
       COUNT(*)                        AS api_calls,
       SUM(input_tokens)               AS input_tokens,
       SUM(output_tokens)              AS output_tokens,
       SUM(cache_read_tokens)          AS cache_read,
       SUM(reasoning_tokens)           AS reasoning,
       SUM(total_nano_aiu)/1000000000.0 AS ai_units,
       SUM(duration_ms)/1000.0          AS model_seconds
FROM assistant_usage_events
WHERE agent_id IN ('<run A agent id>', '<run B agent id>')
GROUP BY agent_id;
```

The cloud `session_usage` view lags by days and is useless for a same-day trial.
Use the local table.

### 6. Read the scoreboard in the right order

Turns first, then wall clock, then AI usage, then the gate result. Then explain
*why*: one wrong guess about what "overdue" means cost run A an entire extra
turn.

---

## What happened on 18 September 2026

Full record in `results/scoreboard.json`. The earlier, weaker trial is kept in
`results/scoreboard-trial1.json`.

| | Run A, as-is | Run B, prepared |
| --- | --- | --- |
| Turns to a green gate | 2 | **1** |
| Wall clock to green | 131 s | **72 s** |
| AI usage | 22.11 AIU, 15 calls | **13.65 AIU, 8 calls** |
| Output tokens | 5,539 | **3,830** |
| Gate on first attempt | **FAILED, 3 of 11** | **PASSED, 11 of 11** |

Driven to the same finish line, the prepared run cost less on every axis
measured. Run A's first attempt implemented:

```js
function isOverdue(invoice, asOf) {
  return invoice.status === "SENT" && invoice.dueDate < asOf;
}
```

Past-due `DRAFT` invoices vanish. All three gate failures trace to that one line.
It took a full round trip through the gate to discover it.

**The brief did not make the model faster.** It removed an ambiguity the model
could not resolve from the code. Ambiguity is what produces confident, wrong
work, and confident wrong work is what you pay for twice.

### Why an earlier trial said the opposite

The first trial stopped each run where the agent declared itself done. By that
measure Run A "won" at 72 s against B's 141 s, while failing 3 of 11 gate tests.
Measuring a run where it claims success rather than where it passes acceptance
flatters whichever run gives up earliest. Both trials are kept so you can show
the trap if you want to.

---

## The TWTTY step

Run B's preparation is what a TWTTY conversation produces. To show that live
rather than assert it, run this against `runs/A` after it finishes:

```
Here are the commands you just ran and how long each took. Name the step that
cost the most and explain what makes it expensive. Propose the smallest safe
change that still satisfies every acceptance criterion, list anything the change
would stop covering, and tell me how we would measure whether it helped. Do not
change the acceptance criteria.
```

Then compare its proposal against what is already in `prep/`.

---

## Honesty rules for presenting this

These are not optional. The session argues for measurement, so the measurement
has to survive scrutiny.

- **n = 1.** One trial is an illustration. For any quantified claim in public,
  repeat the trial and report the median, not the best run.
- **Say the run order and the cache state.** A first, then B, both cold.
- **Measure to the gate, not to "done".** Stopping where the agent claims success
  is the single easiest way to get a wrong answer here, and it is exactly what
  the first trial did.
- **Run B's preparation was not timed.** It is therefore *not* inside B's 72 s,
  and a fair end-to-end total cannot be computed from this trial. State that.
  If you rebuild the preparation, time it.
- **AI units are a billing unit, not a token count.** Quote both if you quote
  either.
- **A faster inner loop is not a token saving** and 100 rows is not a scale test.
- **The gate asserts server-generated HTML only.** It says nothing about
  JavaScript behaviour, layout or accessibility. Those belong to the browser
  smoke check and the full-scale run.
- **Run A was not sabotaged.** It is the repository as it stands, with its own
  documented test command. Do not degrade it to make the point.
- **If A ever wins, say so** and look at why. That is the interesting case.

---

## Resetting between rehearsals

To discard staged and unstaged changes to tracked starter files, run from the
repository root:

```bash
git restore --source=HEAD --staged --worktree -- demo/baseline/
```

Then rebuild the rehearsal workspaces:

```bash
cd demo
rm -rf runs
./scripts/setup-runs.sh
```

`runs/` is disposable and is rebuilt from `baseline/` every time.
