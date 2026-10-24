---
sources:
  - https://code.claude.com/docs/en/memory.md
  - https://code.claude.com/docs/en/best-practices.md
verified: 2026-10-24
claude_code: 2.1.303
status: candidate
worth: Nothing ranks conflicting instructions, though most setups assume something does; adds a tie-break that held in practice.
---

# When instructions disagree

## What the harness does

Nothing. Instruction files are concatenated, and if two of them contradict each
other the model may pick either one. **(docs)**

- Claude Code defines no ranking between CLAUDE.md files and rules. **(docs)**
  No doc ranks skills against them either.
- CLAUDE.md reaches the model as a user message after the system prompt.
  **(docs)** No doc ranks it against a chat message. **(opinion: absence)**
- Load order is defined, and it is an order, not a ranking: files nearer the
  working directory come later, `CLAUDE.local.md` after `CLAUDE.md`, user rules
  before project rules. Don't read "last one wins" into it. **(docs)**

## What to do, in order

1. **Remove the conflict.** Give each rule one canonical home and let everything
   else link to it. Every copy drifts eventually: one real case had a rule
   restated in eight places, and two of the copies already contradicted each
   other. **(opinion, from that case)**
2. **Move invariants into mechanics:** hooks, linters, tests, generated contracts.
   When docs disagree with a mechanism, the mechanism decides. **(opinion;
   docs: settings are enforced by the client, CLAUDE.md is not a hard
   enforcement layer)**
3. **Check Claude Code's own guidance.** Your rule may compete with instructions
   Claude Code adds itself, such as its commit and PR conventions. Switch the
   built-in off in settings (`includeGitInstructions`, `attribution`) rather than
   out-arguing it in prose. **(docs)**
4. **Write a short tie-break into CLAUDE.md** for whatever is left. It is advisory
   like every other line in the file, but it turns an arbitrary pick into a
   predictable one. **(opinion)**

## Tie-break template

```markdown
## When sources disagree

- A direct instruction from the human in the session wins over these files.
- Facts (what the code does, API shapes, where files are) come from the source:
  the code, generated artifacts, tests, the filesystem. A doc that disagrees is
  stale.
- Rules for new work come from the hard rules above (and the decision record).
  Topic docs only add detail. Existing code that breaks a rule is not a pattern
  to copy.
- If you can't settle it, don't pick silently. Fix the stale doc on your branch,
  or raise the conflict in the PR or ticket.
```

The key move is to **separate facts from norms**. For a fact, the code beats the
doc. For a norm, the doc beats the existing code.

## Detecting conflicts

- `/doctor prompt-audit` (v2.1.283+) reports instruction files that contradict
  each other or point at files and commands that don't exist. It only reports.
  **(docs)**
- Grep for the same rule restated in several places.
- Have a reviewer read the docs like a hostile reader whose job is to find gaps.
- Tests that prove a document against reality turn prose into evidence.
