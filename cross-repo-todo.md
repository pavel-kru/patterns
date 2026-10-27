---
sources: []
verified: 2026-10-27
status: candidate
worth: A "what the other side owes us" list kept in the asking repo, deleted item by item and without scope or status, silently rots; a re-check found most of its points already delivered and a live bug buried among them. One ledger per receiving side, scoped by ticket and with a status line per entry, keeps it honest.
---

# Cross-repo todos: what one side owes another

Several repos built in parallel (a back end, a front end, an e2e suite, often
by agents) keep needing things from each other: a missing endpoint or field, a
mock that must follow the real API, a legacy behaviour QA has to confirm. This
pattern is how those requests are written down so every side can find them.

## The trap: one free-form list in the asking repo

The starting point was common practice: the front-end repo kept one markdown
file of what it needed from the back end, numbered by section, with the rule
"delete the item when it lands". After a few weeks of two teams working in
parallel, a re-check of every item against the back end's `main` found
**(verified: measured, 87 points re-checked one by one)**:

- 48 points already delivered, still written as open. The file had a banner
  saying it was stale, and nobody had pruned it.
- 2 claims that were factually wrong by then (a hosting caveat that no longer
  applied, an error body that wasn't on the wire).
- A real bug (an endpoint rejecting input it was asked to accept), hidden in an
  item everyone assumed had landed.
- 21 requests in the opposite direction, scattered across the back end's slice
  notes, which no front-end session ever read.

The causes **(opinion, from that re-check)**: "delete when done" hides partial
delivery; a list without status can't be scanned; the file lived in one repo, so
sessions in the other repos never saw it; and nothing tied an item to the ticket
whose hand-over should mention it.

## The pattern

### One file per receiving side, in the repo every session can reach

```
<pipeline repo>/todo/
  README.md          # the rules, once
  <side-a>-todo.md   # what <side-a> owes the others   (ids A-<n>)
  <side-b>-todo.md   # what <side-b> owes the others   (ids B-<n>)
  <qa>-todo.md       # what the test suite owes        (ids Q-<n>)
```

Name each file after **the side that has to act**, not the side that asks, so
"what do I owe" is one file to read. Call it that side's to-do list
(`<side>-todo.md`). `<side>-asks.md` reads as "what this side asks for", the
opposite of what the file holds, and it was renamed after one day for being
unclear. Name the folder and the entries the same
way: `todo/`, and a todo with its id. **(verified: applied; the naming advice
itself is opinion)** Anyone files into any of the files. Put them in
the shared pipeline or meta repo rather than in one of the build repos, so the
ledger doesn't belong to either party. **(verified: applied)**

### Scope every todo by the tracker item, and give it a status line

```markdown
## <TICKET-KEY> · <feature or slice>

### A-15 · <short title>
`<TICKET-KEY>` · <feature> · **open** · filed <date> by <side>

What the asking side does today, what it expects (request/response example),
the reference it relies on, and how to close it.
```

- One `##` section per ticket. Work that spans tickets goes under the epic that
  covers it. A todo without a ticket key isn't filed; the agent asks the human
  instead of inventing a key. **(verified: applied)**
- Statuses: `open`, `in-progress` (with the branch name), `partial` (the body
  says what's left), `done` (with the PR or commit), `dropped` (with why and who
  decided). **(verified: applied)**
- A status line under every heading turns "what's still open" into one grep
  (`grep -B1 '· \*\*open\*\*' todo/*-todo.md`). With that, a script can check
  that every todo has a valid status and that every cross-reference resolves.
  **(verified: applied, 128 todos checked)**
- One question, one todo. A bundle of "open points" under one id can't be
  closed piece by piece; that's how a delivered item hid a live bug.
  **(opinion)**

### Ids are permanent, because code cites them

- Never renumber or reuse an id. Hand-written placeholder types, test skips,
  PRs and ticket comments cite them (`TODO(contract): A-15`). **(verified:
  applied)**
- **Citations reach generated files.** Back-end doc comments that cited the old
  list by section number had flowed into the generated API contract (20
  mentions) and from there into the front end's generated types. Renumbering
  would have meant code edits plus a contract regeneration. **(verified:
  observed in the generated files)** When migrating an existing list, keep its
  section numbers as ids (`§7.2` becomes `A-7.2`), split bundles with letters
  (`A-3.3a`), and start new todos after the highest old number. **(verified:
  applied)**

### Close by trimming, not by deleting

A done todo keeps its heading and id, gets the evidence on its status line, and
its body shrinks to one line: what landed and where. The contract itself is the
truth now, so the JSON example can go. That keeps the file short without
breaking citations. **(verified: applied)**

### Make each side's sessions aware of it

A session started in one repo never loads a sibling repo's files
(`claude-code/loading.md`). An `@import` outside the repo needs an approval that
can be declined. **(docs)** So each build repo's `CLAUDE.md` carries a short
inline section that names the files, what this repo files and what it closes,
and says to read `todo/README.md` before editing. The rules themselves live only
in that README. **(verified: applied; whether sessions follow it is not measured
yet)** The stage skills (builders, QA) get an input line and a step for the
todos. Reviewers that see only the spec and the diff don't read them
(`pipelines.md`). **(verified: applied)**

### Edits are changes to the pipeline repo

A todo filed from a build-repo session is a commit in the pipeline repo. Put it
on a branch named like the work branch and ship it with that work; the work PR
says which todos it filed or closed. **(verified: applied)** The hand-over
(ticket comment to the other side) takes its scope from the section the todos
sit in. **(verified: applied)**

### Renaming a ledger that a workflow mirrors to a tracker

When a workflow mirrors each ledger file into a tracker task (it finds the open
task by a label per side), renaming the files and docs is safe, but:

- Keep the label the workflow matches on. Renamed, it orphans the open task, and
  the next push files a duplicate. With the old label kept, the first sync after
  the rename commented on the existing task. **(verified: applied)** Say in the
  docs why the label keeps the old name.
- A sync that lists changed files with `git diff --no-renames` sees the moved
  file as new, so the open task gets one comment holding the whole file.
  **(verified: observed)** Expect it, and say so in the rename PR.

## Seeding it

Re-check every old item against the other side's `main` rather than copying
statuses over: one read-only agent per group of tickets, each returning
`id | status | evidence | what is left`. The same pass finds the todos going the
other way, in the other side's slice notes and deviation logs, which become the
first entries of its file. Don't trust a status the agent didn't tie to a
file:line. **(verified: applied; 5 agents, about 10 minutes)**

## What it doesn't solve

- A red test run is not a todo. It goes through the run report and the ticket
  bounce. **(opinion)**
- It doesn't keep the ledger true by itself. Only the rule "update the status in
  the same piece of work" does that, and skills or CI have to enforce it.
  **(opinion; not enforced yet)**
