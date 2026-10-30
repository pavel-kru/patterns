---
name: patterns-claude-code
description: The user's verified patterns for running Claude Code agents, in ~/patterns (claude-code/, pipelines.md, atomic-commits.md, pitfalls.md) - which instruction files load when (CLAUDE.md, imports, rules with paths, skills, settings), what wins when instructions disagree, enforcing rules with hooks, sessions spanning several repos, multi-agent pipelines, atomic commits (splitting mixed work into commits that each build, lint-staged and commitlint traps), and proving what a session loaded. Use when setting up or debugging CLAUDE.md, rules, skills, hooks or settings, when designing an agent workflow, or when splitting work into commits.
---

# Claude Code agent patterns (~/patterns)

1. Read the "Claude Code agents" section of `~/patterns/README.md`, then only the
   files the task needs.
2. Run `node ~/patterns/scripts/check-docs.mjs --force`. No output means the cited
   docs are unchanged. Otherwise tell the user which patterns may be stale.
3. Weigh each pattern by its `status` (`proven` or `candidate`) and each claim by
   its label: **(verified)**, **(docs)**, **(opinion)**.

To add or change a pattern, follow the `patterns` skill
(`~/patterns/skills/patterns/SKILL.md`, or `/patterns add`).
