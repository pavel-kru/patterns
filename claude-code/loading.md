---
sources:
  - https://code.claude.com/docs/en/memory.md
  - https://code.claude.com/docs/en/skills.md
  - https://code.claude.com/docs/en/settings.md
verified: 2026-10-24
claude_code: 2.1.303
status: proven
worth: Which instruction files reach the model, and when, is spread over several docs pages and partly undocumented; checked with transcripts rather than the model word.
---

# What gets loaded, and when

## At session start

- `CLAUDE.md` / `CLAUDE.local.md` in the working directory and in every directory
  above it, plus the user (`~/.claude/CLAUDE.md`) and managed files. **(docs)**
- They are **concatenated, not overridden**. When two instructions contradict each
  other, the model may follow either one. **(docs)** See `precedence.md`.
- CLAUDE.md content arrives as a user message after the system prompt, and strict
  compliance isn't guaranteed. **(docs)**
- `@path` imports load with the importing file, resolved relative to that file, up
  to four hops deep. An import in a project file that resolves outside the
  working directory needs a one-time approval per project, and stays off if
  declined. Imports in `~/.claude/CLAUDE.md` and `~/.claude/rules/` load without
  asking. **(docs)**
- Skills: only the descriptions are in context, and with many skills some
  descriptions are dropped to fit a character budget. A skill's body loads when
  the skill is invoked. **(docs)**
- `.claude/settings.json` (hooks, permissions, env) is read only from the
  session's primary working directory, with no fallback to parent folders: where
  it started, or where `/cd` moved it. `settings.local.json` is read at the git
  repo root. **(docs)**

## Later, on demand

- A `CLAUDE.md` in a **subdirectory** loads the first time Claude reads, writes or
  edits a file in that subdirectory. **(docs; verified: nested repo, transcript)**
- `.claude/rules/*.md` with a `paths:` list loads when Claude reads, writes or
  edits a matching file, and on a Bash `cat` or `head` of one. **(docs;
  verified: transcript shows a `nested_memory` attachment right after the Read,
  and nothing before it)**
  - Globs are relative to the directory holding the rule's `.claude/` folder,
    including a nested repo's. For `~/.claude/rules/`, they are relative to the
    primary working directory. **(docs; verified for repos)**
  - Quotes around the globs were optional in the test. **(verified)** Quote a
    glob that starts with `*`, `{` or `[`, though. Front-matter that doesn't
    parse makes the rule load at start as if it had no `paths:`. **(docs: the
    fallback; opinion: that YAML reads those characters as syntax)**
  - A rule without `paths:` loads at start. One in a subdirectory's
    `.claude/rules/` loads with that subdirectory, on first touch. **(docs)**
- Skills in a nested `.claude/skills/` appear after the first touch of a file in
  that subdirectory, or right away with `/add-dir <subdir>`. **(docs;
  observed)**
- Files that load on demand are cut off past about 40,000 characters (v2.1.309+),
  with a note to Read the rest. **(docs)**

## Traps

- **An `@import` inside a path-scoped rule loads eagerly at session start.** The
  rule's own body stays lazy, but the imported file doesn't. Put the content in
  the rule itself if it should load lazily. **(verified on 2.1.303; the docs
  don't cover it, so re-test after on-demand loading changes)**
- **A sibling directory is never loaded.** It isn't the working directory, a
  parent or a child. **(verified)** The exceptions are `/cd` into it, or
  `--add-dir` with the env variable (see `multi-repo.md`). **(docs)**
- **`AGENTS.md` is read only when no `CLAUDE.md`, `.claude/CLAUDE.md` or
  `CLAUDE.local.md` exists in the working directory or above it.** The user and
  managed files don't count. So adding a personal `CLAUDE.local.md` switches
  `AGENTS.md` off. With both present, add `@AGENTS.md` to `CLAUDE.md`. **(docs)**
- **A symlinked rule that points outside the working directory** counts as an
  external import. After approval, only the ones without `paths:` load. Use
  `~/.claude/rules/` for personal rules instead. **(docs)**
- **After `/compact`** only the root `CLAUDE.md` comes back. Nested files and
  path rules return on their next match. **(docs)**
- **A README holding rules is data, not instructions.** It reaches the model only
  if the model decides to read it. Import it (`@README.md`) when it is the
  rulebook. **(verified: transcript)**

## Cost

Everything loaded at start is paid for in every session. Keep each `CLAUDE.md`
under about 200 lines. Imports don't cut the cost, because they load with the
file, and Claude Code warns when the files loaded at start add up past a
combined limit. **(docs)** Move topic docs that apply to one area into
path-scoped rules. **(docs)**
