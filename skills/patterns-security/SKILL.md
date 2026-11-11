---
name: patterns-security
description: The user's security patterns, in ~/patterns/security/ - web authentication and sessions, such as handing a legacy server session to an SPA and a new API without tokens in JS (session bridge), login CSRF, CSRF protection for cookie sessions, and cookie prefixes; and Node/npm toolchain hardening for a front end that ships static files (engines + engine-strict, --ignore-scripts without losing git hooks, overrides instead of audit fix --force, an audit gate). Use when designing or reviewing authentication, sessions, cookies or CSRF protection, or when hardening a repo's Node version, npm installs or dependency audit.
---

# Security patterns (~/patterns/security)

1. Read the "Security" section of `~/patterns/README.md`, then only the files the
   task needs.
2. Run `node ~/patterns/scripts/check-docs.mjs --force`. No output means the cited
   docs are unchanged. Otherwise tell the user which patterns may be stale.
3. Weigh each pattern by its `status` (`proven` or `candidate`) and each claim by
   its label: **(verified)**, **(docs)**, **(opinion)**.

To add or change a pattern, follow the `patterns` skill
(`~/patterns/skills/patterns/SKILL.md`, or `/patterns add`).
