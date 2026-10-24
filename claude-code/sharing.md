---
sources:
  - https://code.claude.com/docs/en/skills.md
  - https://code.claude.com/docs/en/memory.md
  - https://code.claude.com/docs/en/settings.md
  - https://code.claude.com/docs/en/permissions.md
  - https://code.claude.com/docs/en/errors.md
verified: 2026-10-24
claude_code: 2.1.303
status: proven
worth: Picks the carrier (CLAUDE.md, skills, memory, hooks, settings) by reach, context cost and enforcement, with a verified way to sync skills across machines.
---

# Sharing knowledge across sessions, projects and machines

## Pick the carrier by reach and cost

| Carrier | Reaches | Context cost | Enforced? |
|---|---|---|---|
| `~/.claude/CLAUDE.md` | every session on the machine | always loaded | no **(docs)** |
| user skill (`~/.claude/skills/<name>/`) | every local session on the machine, not Cowork or cloud sessions | description only; body on use | no **(docs)** |
| project skill (`<repo>/.claude/skills/`) | sessions started in or below that repo; one started above it on first touch; `--add-dir` or `/cd` | description only | no **(docs)** |
| auto memory (`~/.claude/projects/<repo-slug>/memory/`) | every session in that git repo, worktrees and subdirectories included (outside git: that folder) | first 200 lines or 25 KB of `MEMORY.md` | no **(docs)** |
| project hooks / settings | sessions whose working directory holds that `.claude/` (started there or moved there with `/cd`), once the folder is trusted | none | yes **(docs)** |
| plugin (marketplace + `enabledPlugins`) | every repo that enables it, the whole team | description only | hooks yes **(docs, not tested)** |

For "how to work with my patterns repo, from anywhere", use a **user skill**:
it reaches every session for the price of one description. **(opinion)** It is
installed here as `~/.claude/skills/patterns`, with one skill per domain next to
it (`patterns-claude-code`, `patterns-security`, `patterns-frontend`), so each
domain gets its own description and its own 1,536-character listing cap.
**(docs: the cap; verified: all four listed in the transcript of a session
started in an unrelated directory)** All descriptions also share one listing
budget, and with many skills some descriptions are dropped. Each extra skill adds
to that pressure. **(docs)**

## Write the description for the reader who won't open the skill

In a test the model took the repo path from the description and grepped the repo
directly, without invoking the skill. **(verified, n=1)** So:
- put **where** (paths) and **when** (triggers) in the description;
- put the procedure (steps, rules for contributing) in the body;
- keep anything that must hold, such as "don't commit unprompted", in hooks or
  in the user's memory as well, because a skill that is never invoked can't
  enforce it.

## Keep the skill in a repo, link it into place

The skill lives in a git repo, which gives it versioning, review and sync between
machines. An `install.sh` symlinks it into `~/.claude/skills/`. **(practice; see
`install.sh` here)**
- Re-runnable: replace an existing link, back up a real directory, and never
  clobber a local file. Put the backup **outside** `~/.claude/skills/`: a
  `<name>.bak/SKILL.md` there is still a personal skill location and would load
  as a stale duplicate. **(opinion, from where personal skills load; docs: the
  locations)**
- Prune links that point into the repo when their target is gone, or a deleted
  skill keeps being offered.
- Give it a `--check` mode (or a separate `verify.sh`) that changes nothing and
  exits non-zero. It should catch a real directory shadowing the link, a dangling
  link after the repo moved, and a link pointing elsewhere.

## Personal overlay on a team repo

To keep your own skills, hooks and notes for a team repo without committing them
to it **(practice)**:
- link `skills/`, `hooks/` and `settings.json` into the repo's `.claude/` when
  `.claude/` is gitignored there. Claude can't edit a linked file in place: it
  refuses to write into a symlinked directory and sends you to the link's
  target, and permissions are checked against both paths. Edit the overlay in
  its own repo. **(docs)**
- for a file inside a **tracked** directory, add it to `.git/info/exclude`, not
  `.gitignore`: `.gitignore` is itself tracked, and `info/exclude` stays local;
- keep `settings.local.json` machine-local: seed an empty one at the git repo
  root (for a worktree, the main checkout's), and never symlink it **(docs: where
  it is read)**;
- link memory files **one by one** into
  `~/.claude/projects/<repo-slug>/memory/`. The slug comes from the git repo's
  root path, not the start directory (`/` becomes `-`). Compute it on each
  machine instead of hard-coding it. New memories need a re-run of the
  installer. **(docs: repo-derived)** `autoMemoryDirectory` in settings can
  point memory at a directory of your choice instead, which would make the
  per-file links unnecessary. **(docs, not tested)**
- add a **Stop hook that asks for sync**: it compares content between the repo
  and the live copies, finds uncommitted or unpushed work, and blocks once per
  state.

## Cross-machine rules

- `git pull` is the sync step, and nothing is pulled automatically. Pull before
  starting on the other machine.
- Claude rewrites memory files on its own, and records each write time in a
  `modified` front-matter field. The repo gains changes you didn't make, and two
  machines editing one memory between pulls will conflict. **(docs; verified:
  unrequested changes)**
