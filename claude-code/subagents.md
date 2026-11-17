---
sources:
  - https://code.claude.com/docs/en/sub-agents.md
  - https://code.claude.com/docs/en/env-vars.md
  - https://code.claude.com/docs/en/skills.md
verified: 2026-11-17
claude_code: 2.1.296
status: proven
worth: Built-in subagents silently run on the main session's model (the most expensive one included) and the default-model variable skips Explore; seen in 209 subagent transcripts and a four-agent probe. Plus where a cheap model pays and how to find that work.
---

# Subagents: which model they run on, and what to delegate

## Which model a subagent runs on

Claude Code takes the first of these that is set **(docs)**:

1. `model` on the Agent tool call (an alias only, not a full id or `inherit`);
2. `model:` in the agent's definition (`~/.claude/agents/<name>.md`), `inherit`
   included;
3. the `CLAUDE_CODE_SUBAGENT_MODEL` environment variable;
4. the parent's model.

A probe with a Haiku parent and `CLAUDE_CODE_SUBAGENT_MODEL=sonnet` in the
settings `env` block, four subagents started in one message
**(verified: `claude -p`, transcripts, Claude Code 2.1.296)**:

| Subagent | `model` on the call | Ran on | Shows |
|---|---|---|---|
| general-purpose | none | Sonnet | the variable applies |
| custom, `model: haiku` | none | Haiku | the definition beats the variable |
| custom, `model: haiku` | `sonnet` | Sonnet | the call beats the definition |
| Explore | none | Haiku (the parent) | the variable doesn't reach Explore |

Traps:

- **Built-in agents follow the main session's model, the most expensive one
  included.** Over two weeks of sessions without the variable, general-purpose
  ran on Opus under an Opus session 46 times out of 46, and on Fable under a
  Fable session 40 times out of 40; forks matched their parent too. Switching
  the session to the top model silently moves every search and review subagent
  to its price. **(verified: transcripts, 209 subagent runs)**
- **The variable alone doesn't move Explore or Plan.** **(docs; verified for
  Explore by the probe)** Under a Fable session, Explore ran on Opus, which is
  what the docs give for a subscription. **(verified: transcripts; docs)** To
  move Explore, define a user agent named `Explore` with its own `model:`; it
  replaces the built-in. **(docs, not tested)**
- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` moves Explore and Plan too, but also
  ignores every definition's `model:` and the call's `model`, so it lifts
  cheap agents to the forced model as well. Forks still follow the parent.
  **(docs)**
- Before v2.1.251 the variable overrode both the call and the definition. On
  an older install the table above doesn't hold. **(docs)**
- A definition's `model: haiku` held under every parent: Opus, Fable, Sonnet
  and Haiku sessions (83 runs). The claude-code-guide and web-fetch helpers ran
  on Haiku whatever the parent. **(verified: transcripts)**
- To check a model: `/tasks` names it while the subagent runs (v2.1.242 or
  later) **(docs)**. Afterwards it is `message.model` in
  `<session>/subagents/agent-*.jsonl`, and the agent's type is in the matching
  `agent-*.meta.json`, not in the transcript itself. **(verified on 2.1.296)**

A split that fits **(opinion)**: the variable set to a mid model for every
unassigned subagent (drafting, building, reviews are judgment work);
`model: haiku` and `effort: low` in the definitions of mechanical agents; the
call's `model` for a one-off that needs the top model.

## Decide where the context is, execute in a cheap subagent

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

## Finding work to delegate, in transcripts

Count what the main thread does itself, then give the mechanical part to cheap
agents. From `~/.claude/projects`:

```bash
# Bash commands the main thread ran, by their first line
find . -name '*.jsonl' -mtime -14 -print0 | xargs -0 cat | jq -r '
  select(.type=="assistant" and (.isSidechain|not)) | .message.content[]?
  | select(.type=="tool_use" and .name=="Bash") | .input.command | split("\n")[0]' \
  | awk '{print $1, $2, $3}' | sort | uniq -c | sort -rn | head -40

# Subagents started, by type and description
find . -name '*.jsonl' -mtime -14 -print0 | xargs -0 cat | jq -r '
  select(.type=="assistant") | .message.content[]?
  | select(.type=="tool_use" and .name=="Agent")
  | [(.input.subagent_type // "general-purpose"), (.input.model // "-"), .input.description] | @tsv' \
  | sort | uniq -c | sort -rn

# The model each subagent ran on, with its type
for m in ./*/*/subagents/*.meta.json; do   # ./ : folder names start with '-'
  printf '%s\t%s\n' "$(jq -r .agentType "$m")" \
    "$(jq -r 'select(.type=="assistant") | .message.model' "${m%.meta.json}.jsonl" | sort -u | tr '\n' ' ')"
done | sort | uniq -c | sort -rn
```

Traps in the method:

- Keep only the first line of each command. Heredocs and inline scripts
  otherwise fill the top of the counts with `EOF`, `}` and code lines.
  **(verified)**
- Subagent transcripts sit under the session folder and match the same `find`;
  their entries carry `isSidechain: true`. Without the filter, subagent work
  counts as main-thread work. **(verified on 2.1.296)**
- Project folder names start with `-` (`-home-me-repo`), so a bare `*/...`
  glob hands jq a path it reads as an option (`Unknown option`). Prefix
  globs with `./` or use `find .`. **(verified)**
- When cutting a skill's runs out of a session, a human turn's `content` is
  either a string or a list of `text` blocks, and tool results are user
  messages too. Ending a run only on string turns folded later, unrelated work
  into the skill's runs and more than doubled the median calls (66 instead of
  27.5). **(verified)**
- The transcript format is internal and changes between versions
  (`claude-code/verification.md`).

What it found once: in two weeks the main thread had run about 330 check
commands (type-check, lint, tests), 300 issue-tracker reads, 280 lookups in a
legacy checkout and 70 loops over sibling repos. Each became a read-only Haiku
agent with a fixed report format and a "never" list. Most general-purpose
subagent calls, by contrast, were judgment work (drafting docs, building
features, reviews) and stay on a mid model. **(verified: the counts; opinion:
the split, savings not measured yet)**
