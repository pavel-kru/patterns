---
sources: []
verified: 2026-10-24
claude_code: 2.1.303
status: candidate
worth: Hand-off, isolation and gate rules from a pipeline of about ten agents that run in practice; they keep reviewers and QA independent of the builder, which ad-hoc agent setups rarely do.
---

# Multi-agent pipelines

From a pipeline that rebuilds a legacy app one page ("slice") at a time with
roughly ten agents: scope, docs, manual, QA writer, QA on old UI, QA on new UI,
back-end dev, front-end dev, two reviewers, deploy. The structure below is
applied there **(verified: applied, seen in its skills, runbook and decision
record)**. Whether it produces better results than the alternatives hasn't been
measured, hence `candidate`.

## Hand-offs carry artifacts, never transcripts

- Each stage reads files and writes files: docs, specs, a contract, a PR.
  The previous session's transcript is not an input. **(verified: applied)**
- **A reviewer gets only the spec and the diff.** **(verified: applied; the
  review skill's context rule says exactly that)** A reviewer who shares the
  builder's context ends up approving its own work. **(opinion)**
- **The QA writer derives tests from the document only, never from the code,**
  and runs them against the old system first. **(verified: applied)** If the
  document is wrong, those tests fail, and that failure is the pipeline doing
  its job. **(opinion)**
- A link to the session that produced an artifact is fine for audit. It never
  becomes context. **(verified: applied, as a ticket field)**

## Artifact formats

- Markdown from templates, with a fixed YAML front-matter (`slice`, `routes`,
  `source`, `permissions`, `depends_on`, `owner`). Agents read the header,
  humans read the body. **(verified: applied)**
- **The front-matter is an API.** Validate it in CI and cross-check it against
  the inventory it references. Drop a header field that duplicates state kept
  elsewhere: the pipeline removed a `status` field because the ticket status
  already held it and the two drifted. **(verified: applied, a recorded
  decision; CI validation: opinion, not built yet)**
- The as-is document records quirks as regression behaviour (`as-is oddity:`).
  The to-be spec starts as a verbatim copy of it. Every deliberate change is a
  human edit in a change log, and the diff between the two doubles as release
  notes. **(verified: applied; a script makes the copy)**
- The contract between back end and front end is **generated**: OpenAPI from
  code, then TypeScript types. A back-end test fails when the committed spec is
  stale, and an edit hook in the front end blocks hand edits of the generated
  file. Nobody hand-writes a shape the generator has. **(verified: applied)**
- Acceptance criteria are **executable**. The same e2e suite runs against the old
  and the new UI. **(verified: applied)** A green run on old proves the doc, a
  green run on new proves parity. **(opinion)**

## Isolation and concurrency

- Each stage writes to its own repo and branch (`<key>-<slice>-<stage>`).
  Stages that run in parallel write to different repos. **(verified: applied)**
- The ticket status is the lock: one status, one stage, one skill. **(verified:
  applied)**
- Two sessions in one repo get two `git worktree`s (`claude-code/multi-repo.md`).

## Gates and loops

- Human gates read reports (test runs, the doc→spec diff), not the documents.
  **(verified: applied)**
- Cap review rounds at three, then hand to a named human. Each red QA result goes
  back to the stage that produced the broken artifact. **(verified: applied)**
- Put CI on every PR. Without it, a red `main` goes unnoticed, and every agent
  that runs the checks then tries to "fix" a failure it didn't cause.
  **(opinion; the pipeline ran without CI when this was written)**

## Cost

Where the money went on one day of a plan → build → review pipeline (planning
and orchestrating sessions on the second-best model, builder subagents on a mid
model, one long-lived reviewer session on the top model), priced at API rates
from the transcripts' `usage` records **(verified: transcript analysis,
2026-11-19, Claude Code 2.1.327)**:

- **The orchestrator's context, not the reviewer's model, was the main cost.**
  Orchestrating sessions took 52% of the day, the top-model reviewer 25%, all
  builder subagents 22%, lookup subagents under 1%. **(verified)**
- In the busiest orchestrating session 71% of the cost was re-reading its own
  context: median 373k tokens a call over 561 calls, because one session ran
  several tickets. A third of its calls produced under 300 output tokens
  (status checks, relays) and still cost a quarter of the session. Capping the
  context at 150k would have cut the re-reading by 60% (computed from the same
  calls). **(verified: the numbers; the cap is a what-if, not a run)**
- The reviewer paid mostly for what entered its context: 54% cache writes (new
  files, diffs, excerpts), 25% re-reading, 21% output. **(verified)**
- **Resuming a big idle session costs a full reload.** One message to a
  460k-token session after a night idle wrote the whole context to cache again:
  the most expensive single call of the day, before any work. Start a new
  session instead of resuming a large one the next day. **(verified)**
- Plan review was the cheapest step with the most effect: two rounds on one
  plan cost about as much as one code-review round and produced eight required
  changes before any code existed. Second code-review rounds almost always
  only confirmed the fix. **(verified: per-turn cost; the judgement of the
  findings is the reviewer's own)**
- About a quarter of a day's code-review findings repeated a class of bug
  found earlier that day in another task. **(verified: counted by the reviewer
  from its own findings, not by a second party)** A short lessons file that
  builders and the reviewer read first is the fix being tried. **(opinion,
  not measured yet)**

What follows from it **(opinion; applied 2026-11-19, savings not measured
yet)**: one session per task with a small main thread on a mid model, the
plan, a status note and the lessons file as the only hand-over, planner,
builder and reviewer as defined subagents with their own models, the reviewer
briefed with the task id, the spec path and the diff command only, and a
second review round only for high and medium findings.

Also in `claude-code/subagents.md`: which model a subagent runs on, deciding
in the main thread and executing in a cheap subagent, and finding that work in
transcripts.
