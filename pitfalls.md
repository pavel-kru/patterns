---
sources: []
verified: 2026-10-21
claude_code: 2.1.303
status: proven
worth: Traps that each cost real time to diagnose, each with a fix that was verified.
---

# Pitfalls

**File upload tests hang under jsdom + MSW.** jsdom's `File` has no `stream()`.
MSW turns the XHR into a Node `Request`, and a multipart body built from a jsdom
`FormData`/`File` never finishes streaming, so the handler never answers. A Node
`File` doesn't help either: jsdom's `FormData` turns it into the string
`"[object File]"`. Fix: stub the upload call in that test. Real browsers are
fine. **(verified)**

**Symlinked `node_modules` in a worktree shares more than packages.** It also
shares the caches (`node_modules/.vite`, a `tsBuildInfoFile` under
`node_modules`). In one run the symlink disappeared mid-run, and 47 test files
failed to resolve imports. Give each worktree its own install (pnpm's shared
store keeps that cheap) and keep caches outside `node_modules`. **(verified)**

**`check && git commit && git push` in one command.** The commit goes out before
anyone reads the check output. Run the check, read it, then commit. **(verified)**

**Formatters rewrite front-matter.** Prettier turned double quotes into single
quotes in rule `paths:`. That's harmless (`claude-code/loading.md`), but test
after formatting, not before. **(verified)**

**A formatter the repo doesn't configure rewrites the whole file.** With no
config in the repo, Prettier applied its defaults (double quotes) to a file
written with single quotes: a 47-line diff became 113 lines. Look for the repo's
formatter config before running one, and check `git diff --stat` afterwards. If
the diff grew, revert and edit by hand. **(verified: Prettier 3.9.10)**

**Missing toolchain: run the tests in a container, and give Testcontainers the
Docker socket.** The host had no JDK, so a Java backend's tests ran in
`eclipse-temurin:21-jdk` with the repo mounted and a named volume on
`/root/.gradle`, so reruns don't download Gradle and dependencies again. The
Testcontainers tests then failed with `Failed to load ApplicationContext`, which
reads like a broken change. The root cause was that no Docker environment was
found. Mount the socket and point Testcontainers at the host:
`-v /var/run/docker.sock:/var/run/docker.sock -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal`.
Before reporting a test failure, read the last `Caused by:`, not the first line.
**(verified: Docker Desktop 29.4.0 on macOS, 4 failures → 0 of 169)** On Linux,
`host.docker.internal` also needs `--add-host=host.docker.internal:host-gateway`.
**(opinion, not tested)**

**"No errors in the log" from a check that can't fail.** Headless Chrome
(`--headless=new --enable-logging=stderr`) printed nothing for a built app, which
looked like "no CSP violations". A probe page with a deliberate violation printed
nothing either, although its inline script was blocked (seen with `--dump-dom`).
Before trusting a clean result, run the check once on an input that must fail.
For CSP in headless Chrome, check the effect instead: the DOM (`--dump-dom`) or a
screenshot. **(verified: Chrome 156 on macOS)**

**Model self-reports.** "Was X loaded?" answers are often wrong. Read the
transcript instead (`claude-code/verification.md`). **(verified)**

**Hooks on macOS run under `/bin/bash` 3.2.** There is no `mapfile`, no
associative arrays, and `"${arr[@]}"` on an empty array fails under `set -u`.
File mtimes need GNU `stat -c %Y` on Linux and BSD `stat -f %m` on macOS. A hook
that breaks this exits non-zero, which Claude Code treats as a silent,
non-blocking error, so the check just never fires on the Mac. **(practice;
bash 3.2.57 verified on macOS)**

**Testing hooks from zsh.** zsh's `echo` expands `\n` inside JSON and produces
invalid input or output. Pipe JSON with `printf '%s'`. **(verified)**

**Allowlists can remove a decision point.** A `Bash(git commit *)` allow rule
meant commits never showed up as a prompt, and seven unreviewed commits landed.
Prefer a hook that asks the user over an allowlist entry. **(practice)**

**Case sensitivity.** macOS and Windows ignore case in paths, Linux doesn't. A
clone named `front` passes locally and breaks `../Front/...` paths on a Linux
runner. **(opinion)**

**PowerShell globs.** `git worktree repair C:\x\*` passes a literal `*` to git.
Expand it yourself: `(Get-ChildItem C:\x -Directory).FullName`. **(docs: PowerShell)**

**A failing provider API.** On repeated 5xx responses, check the provider's status
page before retrying or improvising around it, such as pushing straight to `main`.
**(opinion)**
