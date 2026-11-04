---
sources: []
verified: 2026-10-30
status: proven
worth: Mixed work can be split into commits that each build without `git add -p`, but lint-staged and commitlint each broke the split once in a real run; the traps, and a loop that checks every commit, all verified.
---

# Atomic commits: one concern each, every commit green

One concern per commit: a helper and its call sites, a lint rule, a style
change, a doc change. Every commit type-checks and passes the tests on its own,
so `git bisect` lands on one concern and any one of them reverts cleanly.
**(opinion)** Merge the PR with a merge commit, not a squash, or the history is
gone anyway. **(opinion)**

## The cheap way: commit as you go

Finish one concern, show it, commit it after approval, then start the next.
Nothing has to be split afterwards, and every commit is a state that really ran.
With agents working in the background, give each agent one concern and stop it
for review before the next. **(applied)**

## Splitting a mixed working tree

An agent can't use `git add -p` (interactive), but it doesn't need it.
**(applied: a branch of grouping, paging, sort and style changes, mixed in ~30
files, went out as five commits)**

1. **Order the commits** so each one builds on the one before: a helper before
   the follow-ups that use it, a sweep before the lint rule that bans the old
   form.
2. **Rebuild each commit's files from `HEAD`.** Every hunk of
   `git diff -U0 HEAD` is positioned against `HEAD`, so a commit's version of a
   file is `HEAD` with only that commit's hunks applied, bottom-up. A hunk that
   mixes concerns (paging lines right above grouping lines) needs its text
   written out for each step.
3. **Stage without touching the working tree:**
   `git hash-object -w --stdin` then
   `git update-index --cacheinfo 100644,<blob>,<path>`. The same two commands
   stage half a file. **(verified)**
4. **Check the split before committing:** the last step's rebuilt files must
   equal the working tree byte for byte. A difference means a hunk went to no
   commit, or to two. **(applied)**
5. **Format each staged blob** with the repo's Prettier config first, so the
   pre-commit hook has nothing to rewrite. **(applied)**

## Traps

- **A working-tree config change runs in the earlier commits' hooks.**
  lint-staged hides the unstaged part of a *partially* staged file, but a file
  with only unstaged changes stays as it is on disk while the tasks run. A new
  lint rule still waiting for its own commit therefore lints the commits before
  it, and they fail on code the rule bans. Set the config aside (keep a copy)
  until its commit. **(verified: lint-staged 17.6.0, probe repo; the task read
  the unstaged file's new content and the partially staged file's staged
  content)**
- **The hook's fix can land twice in the working copy.** `eslint --fix` (here a
  warning-level padding rule that adds a blank line) fixes the staged copy, and
  restoring the unstaged changes applied it again: one blank line became three
  over three commits. The commits were right; the working copy wasn't. Diff the
  working copy against what you expect after each commit. **(verified)**
- **commitlint rejects a subject that starts with an identifier.**
  `refactor: Array.from(...) …` fails `subject-case` (config-conventional) as
  sentence case. Reword it (`refactor: map groups with Array.from …`).
  **(verified: commitlint 21.2.3)**
- **Lint warnings are not in `eslint --quiet`, but `--fix` applies them.** A
  tree that passes `--quiet` can still change when the hook runs. **(verified)**

## Check every commit before pushing

```bash
for c in $(git rev-list --reverse origin/main..HEAD); do
  W=$(mktemp -d) && git worktree add -q --detach "$W" "$c" && ln -s "$PWD/node_modules" "$W/node_modules"
  (cd "$W" && npx tsc -b --force && npx eslint src --quiet && npx vitest run) || echo "FAILED $c"
  git worktree remove --force "$W"
done
```

**(applied: five commits, each type-checked, linted and tested on its own)**
`--force` because the symlinked `node_modules` shares the incremental build
cache with the main checkout (see "Symlinked `node_modules`" in `pitfalls.md`;
for long-running work give the worktree its own install). **(opinion)**
