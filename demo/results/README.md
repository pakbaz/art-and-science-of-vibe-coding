# Historical results

The JSON files in this directory are immutable historical artifacts from the
old demo design. They are **not comparable** with trials produced by
`demo/run.js`: the old feature rule treated a past-due DRAFT as a hidden gotcha,
the gate rewrote app data, setup time was excluded, workspaces were copied
destructively, and some runs stopped at an agent's “done” message.

Do not reuse their numbers as evidence for the redesigned experiment. New trial
state and logs live under ignored `demo/.runs/<id>/`; no new metrics are
fabricated or backfilled here.
