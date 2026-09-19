# Copyable main-session orchestration prompt

Run the invoice A/B experiment as a coordinator. Do not implement the feature in
this main session and do not claim that a shell command creates child sessions.

1. Run `node demo/run.js prepare --id <unique-id> --json`.
2. Call `create_project` with the returned absolute `sourceRepo`.
3. Call `create_session` twice in that project, creating two idle **worktree**
   sessions from the source repository. Use the same model, reasoning effort,
   context tier, mode, and tool grants. Do not send a kickoff prompt yet.
   `create_session` cannot select a model without a kickoff, so explicitly
   select and verify the same model in both fresh idle sessions before either
   `start`.
4. Read each child session's absolute workspace path and session ID. Register
   them with:
   - `node demo/run.js attach A <workspace-A> --session <session-A> --trial <id>`
   - `node demo/run.js attach B <workspace-B> --session <session-B> --trial <id>`
5. Run `start A`, then immediately send its exact returned prompt to session A.
   Wait for the child to finish its turn, run `check A`, and send the exact
   `feedback A` output after a failure. Continue until pass, or until two
   consecutive attempts make no material progress; then run `mark-incomplete A
   --reason "<observed stagnation>"`.
6. Only after A passes or is marked incomplete, repeat the same process for B.
   If B has failed and is genuinely struggling, `twtty B` may be used once;
   send its exact diagnostic prompt and continue checking. Its optimization
   never replaces the full repository suite or independent acceptance gate. Do
   not use TWTTY merely to manufacture an advantage.
7. Open each real child session's Insights. Record only values shown there with
   `insights A|B`, including provenance, reference, units, model runtime, tokens,
   cache reads, calls, and cost/AI-credit fields when present. Leave missing
   fields omitted.
8. Run `compare`. Report complete and incomplete lanes, measured workspace
   preparation separately, wall time to actual pass, iterations, active command
   time, and Insights without declaring a winner from missing or non-comparable
   data. Authoring and host provisioning are unmeasured, so the end-to-end total
   remains unknown.

The wall clock intentionally includes agent work, tool execution, corrective
round trips, and presenter/user pauses. Never stop it at the child's “done”
message. Never show or copy `demo/gate/` into either child workspace.

Git worktrees are change-isolation, not security isolation: they share Git
history and do not hide other filesystem paths. The app-only source has no
parent presentation repository in its history, and every kickoff must retain
the workspace-only restriction. Fresh sessions may still receive global user
instructions and host tool grants in both lanes; do not call A instruction-free.
