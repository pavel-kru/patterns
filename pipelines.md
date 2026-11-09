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

## Cost: decide where the context is, execute in a cheap subagent

- A skill's cost is mostly the conversation it runs in, not its own text: every
  tool call re-sends the whole context. On 46 runs of a ship-a-PR skill (commit,
  push, create, merge, ticket updates) the median run started at 157k tokens of
  context and made 27.5 model calls, about 4.9M input tokens; the skill text
  (~3.3k tokens) was about 2% of the starting context, so trimming it barely
  helps. **(verified: transcript analysis, Claude Code 2.1.296)**
- `context: fork` is not the fix when the skill needs the conversation: it
  starts a new subagent with the skill content as its prompt and no history.
  **(docs)** A PR skill needs the history to know which files the work touched
  and why it was done.
- Split instead. The main thread makes the decisions that need the history
  (repos, exact paths to stage, commit message, PR title, a description file)
  and writes them into a short brief. A custom subagent on a cheap model
  (`model: haiku` in `~/.claude/agents/<name>.md`) runs the mechanical steps
  from the brief with a small context. It stops and reports on anything the
  brief doesn't settle (a failed hook, a denied command, a missing value)
  rather than improvising. **(opinion; applied 2026-11-09, savings not measured
  yet)**
- Chain the steps that always go together into one call (`git add && git
  commit && git push`: the commit hook still gates the push). Keep a step the
  permission check may deny, such as a merge, in a call of its own: a denied
  call is denied whole, so a chained create-and-merge would lose the create
  too. **(verified: auto mode denied a merge command as "Merge Without
  Review"; opinion: the split)**
- When measuring from transcripts, a human turn's `content` is either a string
  or a list of `text` blocks, and tool results are user messages too. Ending a
  run only on string turns folded later, unrelated work into the skill's runs
  and more than doubled the median calls (66 instead of 27.5). **(verified)**

