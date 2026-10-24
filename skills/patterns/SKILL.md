---
name: patterns
description: Index of the user's engineering patterns in ~/patterns, and how to add one. Domains so far - Claude Code agents (claude-code/, skill patterns-claude-code), security (security/, skill patterns-security) and front end (frontend/, skill patterns-frontend). Use to save something reusable you learned as a new pattern (/patterns add) - only what passes its worth test, and say plainly when something doesn't - or to look up a pattern when no domain skill fits.
---

# Patterns (~/patterns)

The repo at `~/patterns` holds reusable patterns, templates and scripts, one folder
per domain. Every claim is labelled **(verified: how)**, **(docs)** or
**(opinion)**. Each pattern's front-matter lists the docs it relies on, the date
it was checked, its `status` and, for Claude Code patterns, the Claude Code
version.

## Using a pattern

1. Read `~/patterns/README.md` (the index by domain) and then only the files the
   task needs.
2. Check freshness before relying on a claim. Run
   `node ~/patterns/scripts/check-docs.mjs --force`: no output means the cited
   docs are unchanged. If it lists changes, tell the user that the affected
   patterns may be stale. Only update them if the user wants that now (see
   "Updating" below).
3. Weigh what you read:
   - `status: proven`: the key claims were verified or the pattern was applied
     in real work. `status: candidate`: reviewed or reasoned, not yet proven.
   - **(verified)** was observed on the recorded version, **(docs)** is worth
     re-reading when it matters, **(opinion)** is advice.

## Adding or changing a pattern ("add")

1. **Decide whether it is worth it, and say so.** The repo keeps only what earns
   its place. A candidate qualifies only if all of these hold:
   - **non-obvious**: without it, a competent engineer or agent would likely get
     it wrong or lose time. It must be a trap, a counter-intuitive behaviour or
     a measured trade-off, not a restatement of the docs or common practice;
   - **reusable**: another repo with the same stack would hit it;
   - **evidenced**: at least one key claim was verified (observed, measured,
     applied). Opinion alone is not a pattern;
   - **new**: no pattern covers it yet. If one does, extend that file instead.

   Before writing anything, give the user one verdict line per candidate:
   `worth adding: <why>` or `not worth adding: <which test fails>`. "Nothing
   here is worth a pattern" is a normal answer. Drop a weak candidate rather
   than padding it, and fold a strong detail into an existing pattern rather
   than giving it a file of its own.
2. **Generalise.** No project or company names, hosts, people, ids or internal
   paths. Use "the front-end repo", "the generated contract" and so on.
3. **Place it.** Extend the closest file in the README index, or create a new
   file in its domain folder with the front-matter:
   ```yaml
   ---
   sources: [<official doc URLs it relies on, .md where one exists>]   # or [] for practice-only patterns
   verified: <YYYY-MM-DD>
   claude_code: <version from `claude --version`>     # Claude Code patterns only
   status: candidate                                  # proven once verified or applied in real work
   worth: <one line: the trap or cost it saves, and the evidence>
   ---
   ```
   Add a new file to its domain table in the README. A git pre-commit hook
   (`scripts/check-patterns.mjs`) rejects a pattern without `worth:`, a README
   row or evidence labels, and a `proven` one without a (verified) claim.
4. **A new domain** gets its folder with its first pattern, never before. In the
   same change add a README section and a `skills/patterns-<domain>/SKILL.md`
   (copy `patterns-security` as the template), add the domain to this skill's
   description, then run `~/patterns/install.sh`.
5. **Label every claim** with its evidence. Something the model said about its
   own context is not evidence: verify with `claude -p` and
   `node ~/patterns/scripts/transcript-inspect.mjs`, as described in
   `~/patterns/claude-code/verification.md`. A **(docs)** label means you read
   that statement in the current page itself, not that you remember it. Before
   writing a claim down, test it if you can: a plausible claim is not a checked
   one.
6. If you added a docs URL, run
   `node ~/patterns/scripts/check-docs.mjs --update-lock`. It records new pages
   and refuses a changed one until every pattern citing it has been re-verified
   today (see below).
7. **Don't commit on your own.** Show the user the diff
   (`git -C ~/patterns status --short`, `git -C ~/patterns diff`) and commit and
   push only when they ask for it in that turn. Never add a Claude co-author
   trailer.

## Updating after the docs changed

Follow "Keeping the patterns current" in `~/patterns/CLAUDE.md`:
1. read what changed: the report prints a `git diff --no-index` command when a
   snapshot of the verified version exists. Otherwise re-check every claim that
   cites the page against its current text;
2. fix or remove the claims it no longer supports;
3. re-verify;
4. bump `verified` (and `claude_code` in Claude Code patterns, only for
   behaviour you re-observed on that version);
5. run `--update-lock`. It records a changed page only when every pattern
   citing it has today's `verified` date, so a page can't be marked current
   without its patterns being re-checked.
