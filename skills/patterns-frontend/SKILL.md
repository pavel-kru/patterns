---
name: patterns-frontend
description: The user's front-end patterns, in ~/patterns/frontend/ - architecture rules enforced by tooling (Feature-Sliced Design layer and public-API rules as eslint-plugin-boundaries errors, render-only components), bundle size and caching (barrels and sideEffects, vendor chunks, hash cascade and import maps, mock servers kept out of production builds), and form labels and accessible names (Chrome's form issues, group captions, default ids). Use when setting up or reviewing FSD, ESLint architecture rules, Vite/Rolldown bundle splitting, startup JS budgets, MSW in builds, or form accessibility in a front-end repo.
---

# Front-end patterns (~/patterns/frontend)

1. Read the "Front end" section of `~/patterns/README.md`, then only the files the
   task needs.
2. Run `node ~/patterns/scripts/check-docs.mjs --force`. No output means the cited
   docs are unchanged. Otherwise tell the user which patterns may be stale.
3. Weigh each pattern by its `status` (`proven` or `candidate`) and each claim by
   its label: **(verified)**, **(docs)**, **(opinion)**.

To add or change a pattern, follow the `patterns` skill
(`~/patterns/skills/patterns/SKILL.md`, or `/patterns add`).
