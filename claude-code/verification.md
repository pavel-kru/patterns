---
sources:
  - https://code.claude.com/docs/en/cli-reference.md
  - https://code.claude.com/docs/en/memory.md
  - https://code.claude.com/docs/en/sessions.md
  - https://code.claude.com/docs/en/headless.md
  - https://code.claude.com/docs/en/hooks.md
verified: 2026-10-30
claude_code: 2.1.303
status: proven
worth: Models misreport their own context; transcripts give evidence instead, and caught a real wrong answer.
---

# Proving what an agent loaded or was blocked from

## Don't ask the model

A model's answer to "is X in your context?" is unreliable. **(verified)** In one
check the model said a rule hadn't loaded, and the transcript showed it had.
Treat the model's answer as a hint, never as evidence.

## Do this instead

1. Build the situation in a scratch dir or a worktree. Put **marker strings**
   (`RULE-GAMMA-3`) in the body text of the files whose loading you want to
   test. Block-level HTML comments and a rule's front-matter are stripped before
   loading, so a marker there never reaches the model. **(docs)**
2. Run a cheap headless session from the right directory:
   `claude -p "Read src/x/api/a.ts and nothing else, then reply OK." --model haiku --tools Read`
   `--tools` limits which tools exist. `--allowedTools` only auto-approves and
   restricts nothing. **(docs)** Before using `--tools` in skill probes, check
   whether it changes `skill_listing`. **(opinion: not tested)**
3. Read the **transcript**:
   `~/.claude/projects/<cwd, every non-alphanumeric character turned into ->/<session>.jsonl`.
   Very long names are truncated and get a hash appended. **(docs)**
   `node scripts/transcript-inspect.mjs [<dir> | <file.jsonl>] [--grep TEXT]`
   picks the latest session for the directory and prints the prompt, the tool
   calls, and each injected attachment with the local files it carried. With
   `--grep`, it also marks which attachments contain TEXT.
4. Look only inside the injected attachments **(verified on 2.1.303)**:
   - `instructions`: memory files loaded at start, imports included;
   - `nested_memory`: a CLAUDE.md or a rule loaded on file access;
   - `skill_listing`: the skills offered.

   The transcript format is internal and changes between versions **(docs)**,
   so re-check these names after an upgrade. Phrase counts over the whole file
   are confounded, because your prompt contains the phrase too.
5. For a second source, use an `InstructionsLoaded` hook. It logs each
   CLAUDE.md or rule file with its `load_reason` (`session_start`,
   `nested_traversal`, `path_glob_match`, `include`, `compact`), in a
   documented format. It doesn't cover skills. **(docs)**

## Traps in the method

- `--output-format stream-json --verbose` does **not** include injected memory
  text. A "0 hits" there proves nothing. **(verified)**
- Confirm that the session read only the file you meant: list its `tool_use`
  entries, Bash `cat`/`head` included, since those count as reads for path
  rules. **(docs)** A model can read the rule file itself and fake a positive.
  **(verified)**
- Never probe with `--bare`, `--safe-mode`, or `--setting-sources` without
  `project`: they skip CLAUDE.md, skills or hooks, so nothing shows as loaded.
  `--bare` is due to become the default for `-p`, so re-check probes after
  upgrades. **(docs)**
- When testing a hook, also check the file on disk after the run. **(opinion)**
- One probe's "success" can be a false positive. A serialised body of 137 bytes
  turned out to be the string `"[object File]"`. Check the content, not only the
  size. **(verified)**
