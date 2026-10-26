# patterns

Reusable engineering patterns from real codebases, one folder per domain. Every
claim is labelled **(verified)**, **(docs)** or **(opinion)**. `proven`: the key
claims were verified or the pattern was applied in real work. `candidate`:
reviewed or reasoned, not yet proven.

## Claude Code agents

| File | Status | What it answers |
|---|---|---|
| `claude-code/loading.md` | proven | Which instruction files reach the model, and when |
| `claude-code/precedence.md` | candidate | What wins when instructions disagree (nothing built in) and a tie-break template |
| `claude-code/hooks.md` | proven | Enforcing rules with hooks: what blocks, what slips through, loop guards |
| `claude-code/multi-repo.md` | proven | Several repos in one session: siblings, `--add-dir`, nested clones, search |
| `claude-code/verification.md` | proven | Proving what was loaded or enforced, using transcripts instead of the model's word |
| `claude-code/sharing.md` | proven | Sharing knowledge across sessions, projects and machines: skills, overlays, sync |
| `pipelines.md` | candidate | Multi-agent pipelines: hand-offs, isolation, parallel sessions, gates |
| `cross-repo-asks.md` | candidate | What one side of a multi-repo build owes another: one ledger per receiving side, scoped by ticket, with status and permanent ids |
| `pitfalls.md` | proven | Traps that cost real time, with the fix |

## This repo's tooling

| File | What it does |
|---|---|
| `templates/` | CLAUDE.md skeleton (`CLAUDE.template.md`, never named CLAUDE.md here or it would load), hook + settings, a path-scoped rule |
| `scripts/transcript-inspect.mjs` | What a session actually loaded and did |
| `scripts/check-docs.mjs` | Checks that the cited docs haven't changed and shows a diff when they have (local snapshots in `.cache/docs/`). A changed page goes back into `docs.lock.json` only after every pattern citing it was re-verified that day |
| `scripts/check-patterns.mjs` | The pattern contract: `sources`, `verified`, `status`, a `worth:` line, a README row, evidence labels |
| `.githooks/pre-commit` | Runs `check-patterns.mjs` on every commit, from any session or terminal (`install.sh` sets `core.hooksPath`) |
| `skills/` | User skills: `patterns` (index, how to add a pattern) and one per domain (`patterns-claude-code`, `patterns-security`, `patterns-frontend`) |
| `install.sh` | Links `skills/*` into `~/.claude/skills` and turns on `.githooks/` (`--check` to verify only) |
| `.claude/hooks/` | This repo's own hooks: commit approval, co-author block, doc coverage, sync reminder |

## Security

| File | Status | What it answers |
|---|---|---|
| `security/session-bridge.md` | candidate | Handing a legacy server session to an SPA and a new API without tokens in JS, and what a naive version misses |

## Front end

| File | Status | What it answers |
|---|---|---|
| `frontend/fsd-boundaries.md` | proven | Feature-Sliced Design layer and public-API rules as ESLint errors (eslint-plugin-boundaries), the traps that turn them silently green, and a canary test |
| `frontend/render-only-components.md` | candidate | Keeping state, effects and data access out of slice components with two core ESLint rules, and rolling that out with a shrinking exception list |
| `frontend/initial-bundle.md` | proven | Keeping startup JS flat as pages are added: barrels and `sideEffects`, explicit vendor groups, proving cache stability, the hash cascade and import maps, proving nothing visible changed |
| `frontend/mocks-out-of-production.md` | proven | Keeping a browser mock server out of production builds, a build plugin that fails if it leaks, smoke-testing the real bundle on mocks |
| `frontend/form-labels.md` | proven | What Chrome's form label and id/name issues really mean, an audit that reproduces its counts, group captions, default ids, CSS-in-JS dropping `htmlFor` |

## Setup on a machine

```bash
git clone https://github.com/pavel-kru/patterns.git ~/patterns
~/patterns/install.sh && ~/patterns/install.sh --check
```
