---
sources:
  - https://code.claude.com/docs/en/memory.md
  - https://code.claude.com/docs/en/settings.md
  - https://code.claude.com/docs/en/skills.md
  - https://code.claude.com/docs/en/permissions.md
verified: 2026-10-30
claude_code: 2.1.303
status: proven
worth: Sibling repos silently lose their CLAUDE.md, rules and hooks; one verified table per layout that the docs do not give in one place.
---

# Several repositories in one session

Typical layout: a pipeline repo (skills, runbook) next to front-end, back-end,
docs and tests repos.

## What each layout gives you

| Session starts in | Other repo's CLAUDE.md | its `paths:` rules | its hooks | pipeline skills |
|---|---|---|---|---|
| pipeline repo, others are **siblings** | ❌ | ❌ | ❌ | ✅ |
| pipeline repo + `--add-dir ../other` | only with `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` | ❌ (with the env variable: not tested) | ❌ | ✅ |
| pipeline repo + `permissions.additionalDirectories` in settings | ❌ (access only) | ❌ | ❌ | ✅ |
| the repo being changed + `--add-dir ../pipeline` | ✅ | ✅ | ✅ (its own) | ✅ |
| a root repo with the others **cloned inside it** | ✅ on first touch | ✅ on first touch | root's only | ✅ |
| a plain parent folder | ✅ on first touch | — | ❌ none | on first touch |

All rows were **verified with `claude -p` and transcripts**, except the last
row's `paths:` cell, which wasn't tested. The env variable also works when it is
set in `settings.json` under `env`. **(verified)**

## Rules of thumb

- **Start the session in the repo you are writing to.** Everything that repo
  defines works there. **(opinion, follows from the table)**
- A skill that writes to another repo should list that repo's `CLAUDE.md`, and
  anything it `@`-imports, as its first input. That is advisory. **(opinion)**
  The other ways in are `--add-dir` with the env variable, or `/cd` into the repo
  (v2.1.246+). `/cd` loads that repo's CLAUDE.md, settings, hooks and skills.
  **(docs, not tested here)**
  - Its hooks then still get `${CLAUDE_PROJECT_DIR}` pointing at the start
    directory, so a hook command built on it runs the wrong repo's script.
    **(docs)**
- A skill's `paths:` never match files outside the working directory, even after
  `--add-dir`. Pipeline skills scoped by `paths:` won't auto-activate on another
  repo's files. **(docs)**
- **Check each repo's branch before branching for a cross-repo change.** In one
  session, one of four sibling repos was on an unrelated feature branch, and
  `git switch -c fix/x` there would have stacked the fix on it. Fetch, then
  branch every repo from the remote default explicitly:
  `git switch -c fix/x origin/main`. **(practice; the stray branch was observed)**
- **Don't switch the branch of a sibling checkout another session may be
  using.** Its working tree is shared. After a cross-repo change ran
  `git switch -c` in a sibling repo with a clean tree, another session went on
  editing there, and its uncommitted edits landed on the new branch. That
  session saw no warning. Switching back refused ("would be overwritten") for a
  file that differs between the branches; `git switch --merge <its branch>`
  moved the edits back with a three-way merge. **(verified: observed)** For a
  cross-repo change, branch in a worktree outside every checkout instead:
  `git -C <repo> worktree add <absolute path> -b <branch> origin/main`.
  - Give `worktree add` an absolute path. With `git -C <repo>`, a relative path
    resolves against `<repo>`, not your shell's directory, and the worktree
    lands inside that checkout. **(verified: observed)**
- For one declarative entry point, use a root repo with the others cloned inside
  it and listed in its `.gitignore`. It costs a migration of everyone's paths.
- Plugins (a marketplace plus `enabledPlugins` in each repo's settings) can ship
  skills and hooks to every repo, at the price of namespaced skill names.
  `enabledPlugins` is one of the few settings an `--add-dir` directory
  contributes, so its plugins reach a session that only added the repo.
  **(docs, not tested)**

## Search with nested clones

ripgrep, which runs Claude's Grep, honours the root `.gitignore`, so **Grep from the
root doesn't see gitignored nested repos**. **(verified)** Add a root `.ignore`
file, which git doesn't read:

```gitignore
!/front/
!/back/
```

The nested repo's own `.gitignore` (`node_modules/`) still applies. **(verified)**
Glob ignored `.gitignore` either way in the same test. **(verified)**

## Parallel sessions in one repo

One working tree can't safely host two agents. Give each one a `git worktree`:
- each worktree has its own index, so there are no `index.lock` fights;
- each worktree builds into its own `dist/`;
- **the stash stack is shared** between worktrees, so use WIP commits instead of
  `git stash pop`;
- so are `settings.local.json` and auto memory: a worktree uses the main
  checkout's file, so permission approvals made in one session apply in all of
  them. **(docs)**

See `pitfalls.md` for the shared-`node_modules` trap.
