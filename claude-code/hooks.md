---
sources:
  - https://code.claude.com/docs/en/hooks.md
  - https://code.claude.com/docs/en/hooks-guide.md
  - https://code.claude.com/docs/en/best-practices.md
  - https://code.claude.com/docs/en/permissions.md
  - https://code.claude.com/docs/en/env-vars.md
  - https://code.claude.com/docs/en/cli-reference.md
verified: 2026-10-30
claude_code: 2.1.303
status: proven
worth: Instructions only ask; this shows what a hook can actually block in a turn (git hooks run inside the Bash call, Stop loop guards) and what slips through, verified in real sessions.
---

# Enforcing rules with hooks

CLAUDE.md asks; hooks make sure. **(docs: best-practices, "non-deterministic"
vs "deterministic" instructions)**

## Where hooks sit in a turn

```
UserPromptSubmit → model picks a tool → PreToolUse → permission check → tool runs
  (a Bash `git commit` runs git hooks in here) → PostToolUse → … → Stop
```

| Hook | Use it for |
|---|---|
| PreToolUse | prevention: block the call before it happens |
| PostToolUse | fast feedback, such as linting the edited file. It can't undo the call. Claude sees its stderr only on exit 2 **(docs)** |
| Stop | an "are we done?" gate. Watch out for loops. |
| git pre-commit / commit-msg | the last line before a commit, for humans and agents alike |
| CI on the PR | the only gate nobody can skip locally |

## Blocking an edit (verified end to end with `claude -p`)

- Use PreToolUse with the matcher `Edit|Write|NotebookEdit`; `MultiEdit` is
  legacy, and keeping it is harmless. Exit code **2** blocks the call, and
  **stderr goes to the model**, so write it as an instruction: say what to do
  instead. **(verified)**
- File tools send `tool_input.file_path` as an absolute path, with `\` on
  Windows. Normalise `\` to `/` and match by suffix or path segment, never with
  `^`. **(docs; verified)**
- Prefer exec form: `"command": "node", "args": ["${CLAUDE_PROJECT_DIR}/…"]`.
  It uses no shell, so the path needs no quoting. Shell form (no `args`) runs
  under `sh -c` on macOS and Linux and under Git Bash (or PowerShell without it)
  on Windows; there, wrap the placeholder in double quotes. **(docs)** Under
  PowerShell, a `command` that is only a quoted string is printed, not run
  ("PowerShell started no program"): use exec form, or `"shell": "powershell"`
  with `&` before the quoted path. **(docs)**
- **Project hooks load from the session's primary working directory:** where it
  started, or where `/cd` moved it. There is no fallback to parent folders, and
  `--add-dir` brings no hooks. A session in repo A doesn't run repo B's hooks,
  even while it edits B. Put the hook where the sessions start. **(docs)**
- If the hook can't start, crashes or times out, **the edit goes through**. This
  happens, for example, when `node` comes from nvm and the editor was launched
  from the GUI. The exception is a handler with `"onFailure": "block"`
  (v2.1.295+): set it on every policy hook. It has no effect on Stop and other
  async hooks. **(docs)**

See `templates/hooks/` for a working script and settings file.

## What a file-tool matcher doesn't catch

- Writes through Bash: `sed -i`, `cat >`, `tee`.
- `git commit --no-verify`, which skips git hooks.
- Commits or pushes to `main`.

Close these with a PreToolUse hook on `Bash|PowerShell|Monitor` that inspects
the command. **(opinion; docs: those tools take a command)** FileChanged sees
such writes after the fact, but can't block them. **(docs)**

## What can still switch a hook off

- Settings files are watched: an edit to `.claude/settings.json` takes effect at
  once, so a model could drop its own guard. A ConfigChange hook can block that
  change. **(docs)**
- `disableAllHooks`, also passed as `--settings`, turns every hook off. **(docs)**
- Without managed settings, and outside a Team or Enterprise `/login`, a mod can
  approve a call your PreToolUse hook blocked. **(docs)**

Where a rule must hold, enforce it again outside the session: a git hook, CI,
branch protection. **(opinion)**

## Patterns from practice (working copies in `.claude/hooks/`)

All verified 2026-10-22: unit-tested on macOS `/bin/bash` 3.2 and end to end with
`claude -p`.

- **Commit only on the user's word.**
  - A UserPromptSubmit hook clears a per-session marker on every prompt, and
    creates it again only when the prompt *starts with* an approval word
    (`commit`, `ship it`, `lgtm`, `pr`, `/pr`). So "don't commit yet" and "why
    was the PR blocked?" don't count.
  - A PreToolUse(Bash) hook then denies `git commit` unless the marker exists,
    and consumes it, so each approval covers exactly one commit. If the model
    touched the marker itself, that would be a bypass. **(verified)**
  - Caveat: UserPromptSubmit also fires for turns the user didn't type: `/loop`
    and scheduled prompts, a background subagent reporting back, a message from
    another session. Its input doesn't say which, so such a turn starting with
    `commit` would grant approval. **(docs)**
- **Block a co-author trailer.** A session-level attribution instruction can
  override a prose rule in CLAUDE.md. A PreToolUse(Bash) hook that greps the
  commit command for `Co-Authored-By: … claude|anthropic` and denies the call
  holds anyway. **(verified)** Claude Code's own commit guidance can also be
  turned off at the source: `includeGitInstructions`, and `attribution` for the
  trailer text. **(docs)**
- **Deny with JSON.** Instead of exit 2, print
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}`,
  exit 0, and print nothing else to stdout. The reason reaches the model as the
  explanation. **(verified; docs: JSON goes with exit 0)**
- **Stop hooks that ask for follow-up work.** Print
  `{"decision":"block","reason":"…"}` and the model keeps going with that
  reason. **(verified)** For guidance that isn't an error, the docs now offer
  Stop `hookSpecificOutput.additionalContext`, with the same loop protection.
  **(docs, not tested)** Two variants:
  - **Doc coverage:** a manifest maps each doc to the paths it describes.
    Changed files newer than their doc (by mtime, so it works before any commit)
    trigger "update the doc, or say in one sentence why not". **(verified)**
  - **Sync reminder:** if there are uncommitted or unpushed changes, show them
    and ask the user. **(verified)**
- **One block per state, not per stop.** Store a signature of the problem (plus
  `HEAD`) in `$TMPDIR/<hook>/<session_id>` and stay silent if it hasn't
  changed. That prevents loops even where honouring `stop_hook_active` would be
  wrong, for example a sync check whose work happens in exactly that
  continuation. **(verified)**
- Set `timeout` and `statusMessage` on each hook, so a slow check stays bounded
  and visible. A PreToolUse gate that times out lets the call through unless it
  sets `onFailure: "block"`. **(docs)**
- **These hooks protect only sessions whose primary working directory is their
  repo,** whether started there or moved there with `/cd`. A session elsewhere
  that commits to this repo bypasses them. Back the rule with a git hook or with
  the user's memory or skill. **(docs: permissions.md)**

## Loop guards

- A deterministic block plus a message that names the alternative usually ends
  the attempt at once. In a test the model stopped after one block, without
  trying a workaround. **(verified, n=1)**
- A **Stop** hook that exits 2 forces the model to continue. Claude Code ends the
  turn after 8 blocks in a row with no tool call between them, and
  `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` changes the number (`0` disables the cap).
  **(docs; verified on 2.1.296 with an always-blocking hook: 8 by default, 3
  when set to 3, from the process env, from `--settings` and from
  `~/.claude/settings.json` `env`)**
  - **Any tool call resets the count, even a pointless one.** Under repeated
    blocks, haiku called an unrelated MCP tool with empty input after block 5,
    and the run went on to 13 blocks. `--tools ""` leaves MCP tools available.
    The cap only bounds text-only ping-pong; loops that involve tools need
    `stop_hook_active` or a state signature in the hook itself. **(verified)**
  - Each extra continuation is a full model turn. 13 blocks cost $0.32 on
    haiku, against $0.03–0.07 with the cap at 3 or 8 on the same probe.
    **(verified)**
  - Set it to 3 when your own Stop hooks block at most once per state: that
    bounds a broken hook at three wasted turns and leaves room for two hooks
    blocking in one round. **(opinion; verified: two such hooks needed one
    continuation under a cap of 3)** Raise it for a hook that legitimately
    iterates. **(docs)**
- `{"continue": false, "stopReason": "…"}` stops Claude's processing after the
  hook; the session stays open. Use it after N blocks per `session_id`, which
  is in the hook's input. **(docs, not tested)**
- Headless runs need a turn cap (`claude -p --max-turns`, SDK `maxTurns`) and a
  job timeout. **(docs)**
- Pipeline level: cap review rounds, then hand to a human (`pipelines.md`).
