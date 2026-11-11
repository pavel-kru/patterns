---
sources:
  - https://docs.npmjs.com/cli/v11/using-npm/config
  - https://raw.githubusercontent.com/npm/cli/latest/docs/lib/content/configuring-npm/package-json.md
verified: 2026-11-11
status: proven
worth: Three npm settings fail silently when used the obvious way (engines without engine-strict, ignore-scripts in .npmrc, audit fix --force); each was reproduced on npm 11.20 and applied in a front-end repo.
---

# Node toolchain hardening for a front end that ships static files

The front-end repo builds static files that a web server serves. No Node runs in
production. Node runs on dev machines, the CI runner and the build box: the dev
server, the bundler, the test runner and the end-to-end suite. Generic Node.js
advice (Helmet, rate limiting in Express, a permission-model sandbox) has nothing
to attach to here. The runtime CVEs still matter, but for the machines that build
and test, not for the site. **(opinion)**

What does matter: which Node those machines run, what an install executes, and
which dependency versions end up in the lockfile and the bundle.

## When to use it, and when not

- **Use it** for any repo installed with npm where the team runs mixed Node
  versions, or where an EOL Node version can linger on a shared box. **(opinion)**
- **Server code in Node** needs this plus the runtime-side measures (headers
  middleware, input validation, rate limits). This file doesn't cover those.
  **(opinion)**

## 1. Pin Node, and make the pin bite

```jsonc
// package.json
"engines": { "node": ">=24.22.2 <25 || >=26.13.0" }
```
```ini
# .npmrc
engine-strict=true
save-exact=true
```
```
# .nvmrc
26
```

- **`engines` on its own is a warning.** Without `engine-strict`, `npm install`
  on Node 26 with `"node": ">=99"` printed `npm warn EBADENGINE` and installed
  anyway. With `engine-strict=true`, the same install stopped with
  `npm error code EBADENGINE`, and so did `npm ci` on an EOL Node 25 in the real
  repo. **(verified: npm 11.20, scratch project and the real repo)** The docs say
  the field is "advisory only" unless `engine-strict` is set. **(docs)**
- **`npm run` never checks `engines`**, even with `engine-strict`: the script ran.
  **(verified)** The guard works at install time only, so a machine that
  installed before the pin was added keeps running the old Node until its next
  `npm ci`. **(opinion)**
- **Make the floor a security release, not a major version.** Use the first patch
  of each supported LTS line that carries the latest fixes, and exclude
  odd-numbered majors (`<25`): those lines are never LTS, and they go EOL quickly
  while still installed on machines. **(opinion; the release lines are on
  nodejs.org/en/about/previous-releases)**

## 2. Install scripts: skip them on CI, not in `.npmrc`

The common advice is `npm ci --ignore-scripts`, so that a compromised package's
`postinstall` can't run. The tempting shortcut is `ignore-scripts=true` in
`.npmrc`.

- **That shortcut also skips the root package's `prepare`.** With
  `ignore-scripts`, `npm install` didn't run `prepare`. **(verified: npm 11.20,
  the flag and `.npmrc` both)** In a repo whose git hooks are installed by
  `"prepare": "husky"`, a fresh clone then gets no commitlint and no lint-staged,
  and nothing reports it. **(opinion, from the verified behaviour)**
- **Explicit `npm run <script>` still runs.** **(verified; docs: "commands
  explicitly intended to run a particular script ... will still run their
  intended script")** So the build and test steps on CI are unaffected.
- **What to do:** put `--ignore-scripts` on the CI and build-box command line
  only. Dev machines keep a plain `npm ci`. Then run whatever install scripts are
  actually needed as explicit steps: check
  `grep -l '"\(pre\|post\)\?install"' node_modules/*/package.json` for the
  packages that have them, and commit generated files (such as a mock service
  worker script) so their `postinstall` isn't needed. **(opinion; applied)**

## 3. A vulnerable nested dependency: override it, don't `--force`

```jsonc
// package.json: pin the nested copy to the first patched version in its own major
"overrides": { "react-router-dom": "6.30.6" }
```

- **`npm audit fix --force` can trade the advisory for a downgrade.** For a
  vulnerable package that a UI library depended on, audit's fix was to "install
  <library>@4.2.0, which is a breaking change", where the installed version was
  18.x. **(verified)** `--force` would have taken it.
- **`overrides` fixes the nested copy in place.** The docs name this use case
  ("replacing the version of a dependency with a known security issue").
  **(docs)** Stay inside the parent's major, or its code may break. After the
  override, `npm ls <pkg>` shows `overridden`, and the high advisories cleared.
  **(verified)**
- **Check whether the nested package can reach the bundle at all.** The library
  listed the router as a dependency, but its `dist` never imported it, so none of
  that code could be bundled. **(verified: grep of the library's `dist`)** That
  changes the severity in practice, and it's worth saying in the PR when an
  advisory has no fix in that major. **(opinion)**
- **Before taking a lint-plugin upgrade for an advisory, check that the rules
  still fire.** Plugin versions that drop a vulnerable dependency can also
  deprecate config options. Run a known-bad import as a probe and expect an
  error. **(opinion; applied, see `frontend/fsd-boundaries.md` "The canary
  test")**

## 4. An audit gate the team already runs

```jsonc
"audit": "npm audit --omit=dev --audit-level=high",
"check": "... && npm run build && npm run audit"
```

- Production deps only, high and critical only. Dev-tooling advisories and
  moderates without a fix would otherwise keep the gate red, and a gate that's
  always red stops being read. Review those by hand when they come up.
  **(opinion)**
- Put it in the script people and agents already run before a PR, rather than a
  separate command nobody remembers. **(opinion; applied)**

## What this doesn't cover

- A Content-Security-Policy for the static files. The headers belong in the web
  server config. A report-only rollout first is the usual advice, but it's not
  verified here. **(opinion)**
- Server-side Node hardening.
