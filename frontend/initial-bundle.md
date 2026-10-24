---
sources:
  - https://raw.githubusercontent.com/webpack/webpack.js.org/main/src/content/guides/tree-shaking.mdx
  - https://raw.githubusercontent.com/rolldown/rolldown/main/docs/in-depth/manual-code-splitting.md
  - https://raw.githubusercontent.com/vitejs/vite/main/docs/config/build-options.md
  - https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/html/reference/elements/script/type/importmap/index.md
  - https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/html/reference/attributes/rel/modulepreload/index.md
verified: 2026-10-23
status: proven
worth: Barrels with module-level styled calls silently put shared UI into startup, a catch-all vendor group doubled it and an app-only deploy renamed every lazy chunk; all measured.
---

# Initial bundle: barrels, side effects, vendor chunks, cache stability

The initial bundle is the JS a visitor downloads and runs before the app shows
anything. This pattern covers keeping it from growing with every page you add,
and keeping it cached across deploys. Checked on Vite 8 (Rolldown 1.2) with a
React SPA built from lazy route pages and a shared `shared/ui` barrel; applied
and merged in that repo. **(verified)**

## Measure what the browser actually loads

- Initial JS is the entry `<script type="module">` plus every
  `<link rel="modulepreload">` that Vite writes into the built `index.html`.
  Parse that file rather than globbing chunk names: the bundler picks the names
  of shared chunks, and they change when code moves. **(verified)**
- Gzip each file and sum. To see what is inside, attribute bytes to packages and
  source files through the sourcemaps, with `source-map-explorer` or by decoding
  the mappings yourself. Measure before and after every change below.
  **(verified)**

```js
// node initial-js.mjs dist
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = process.argv[2];
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const files = [...html.matchAll(/(?:src|href)="[^"]*?(assets\/[^"]+\.js)"/g)].map(m => m[1]);
const sizes = files.map(f => [f, gzipSync(readFileSync(join(dist, f)), { level: 9 }).length]);
for (const [f, n] of sizes) console.log((n / 1024).toFixed(1).padStart(7), f);
console.log((sizes.reduce((s, [, n]) => s + n, 0) / 1024).toFixed(1), 'kB gzip initial JS');
```

## Barrels pull page-only code into startup

- **Symptom:** components that only lazy pages use (pickers, tables, dialogs)
  sit in the initial chunks.
- **Cause:** the app shell imports the `shared/ui` barrel (`export * from './x'`
  for every component), and each component creates its styled components at
  module level. A module-level call might have side effects, so when the barrel
  is imported the bundler has to evaluate every module it re-exports. That makes
  all of them part of startup. **(verified: 36 modules, about 11 kB gzip of
  page-only UI in the initial set)**
- **Fix:** declare your own modules side-effect free in `package.json` with
  `"sideEffects": ["**/*.css"]`. The bundler then skips any module none of whose
  exports is used, behind a barrel or not. **(docs; verified: initial JS went
  from 201 to 186 kB gzip, 36 modules left it and none joined)**
- **Check first:** nothing may rely on module-level effects, such as top-level
  calls other than the entry's bootstrap, or imports without specifiers
  (`import './polyfill'`). The field drops those in production builds only, so
  dev keeps working and the bug ships. **(docs: webpack's CSS warning;
  verified: the field changes `vite build` output only)**
- **Guard it in lint**, scoped to non-test source:

```js
{
  files: ['src/**/*.{ts,tsx}'],
  ignores: ['src/**/*.test.{ts,tsx}', 'src/shared/test/**'],
  rules: {
    'no-restricted-syntax': ['error', {
      selector: 'ImportDeclaration[specifiers.length=0][source.value=/^(\\.|@\\/)/]:not([source.value=/\\.css$/])',
      message: 'Our modules are declared side-effect free (package.json sideEffects): production builds drop this import.',
    }],
  },
}
```

  It matches relative imports and the `@/` alias. Scoped npm packages
  (`@scope/pkg`) are left alone, because their own `package.json` governs them.
  **(verified with probes: `./x` and `@/x` fail; CSS, npm packages and test
  files pass)**

## After that fix: split the libraries explicitly

- With the page-only modules gone, Rolldown merged the libraries and the shell
  into one entry chunk (579 kB raw, which triggered Vite's 500 kB warning). Every
  deploy then re-downloads the framework along with your code. **(verified)**
- Put the libraries the shell imports at startup into named groups. Give React
  its own group with a higher priority, so the group of a library that imports
  React (the router, for one) doesn't claim it. A group also takes its modules'
  dependencies along. **(verified; docs: dependencies are captured recursively)**

```ts
const packages = (names: string[]) =>
  new RegExp(`[\\\\/]node_modules[\\\\/](?:${names.map(n => n.replace('/', '[\\\\/]')).join('|')})[\\\\/]`);

build: {
  rolldownOptions: {
    output: {
      codeSplitting: {
        groups: [
          { name: 'react', test: packages(['react', 'react-dom', 'scheduler']), priority: 2 },
          // router, query client, http client, css-in-js, toasts... only what the shell imports
          { name: 'vendor', test: packages(SHELL_PACKAGES), priority: 1 },
        ],
      },
    },
  },
},
```

- Never use a catch-all `test: /node_modules/` group. It drags libraries that
  only lazy pages use (the mock server, a markdown renderer, a date library) into
  startup. **(verified: initial JS went from 186 to 400 kB gzip)**
- List a library only when the shell imports it. One left off the list just lands
  in the app chunk. **(opinion)**
- Result: the app chunk is 26 kB, `react` 66 kB and `vendor` 93 kB gzip, with
  the same total, and the size warning is gone. **(verified)**

## Budget it, and test the bundle you ship

- Use one absolute budget for initial JS (plus a cap per lazy chunk), not
  committed per-chunk baselines. With several branches open, every branch
  rewrites the baseline file, the conflicts pile up, and people (and agents)
  learn to bump it. **(opinion)**
- Calibrate the budget so that a typical heavy library trips it: current size
  plus expected growth plus a small margin. A 47 kB gzip markdown chunk imported
  statically would have slipped under a +20 % budget. **(verified: the
  numbers)**
- Before choosing numbers, measure what each new page adds to startup. Here it
  was about 0.25 kB gzip of catalog and route entries per page, and the barrel
  leak above was the real scaling risk. **(verified)**
- Run e2e against the production build. `sideEffects`, vendor groups and import
  maps change only the `vite build` output, so a suite run against the dev server
  never sees them. **(verified)**

## Prove the cache survives a deploy

Build, change one string in the shell in a throwaway `git worktree`, build again,
and diff the file names. The library chunks must keep their names. A rebuild
without changes must produce identical names. **(verified)**

## The hash cascade, and import maps

- That same experiment renamed every lazy chunk after a one-line shell change.
  Lazy chunks import shared code from the entry chunk by its hashed file name,
  so the entry's new name rewrites all of them, and users re-download every page
  after each deploy. This happens with or without vendor groups. **(verified: 37
  of 42 JS files renamed)**
- An import map breaks the chain: chunks import stable keys, and `index.html`
  maps each key to its hashed file. In Vite this is `build.chunkImportMap: true`,
  which is experimental and needs `import.meta.resolve` support. **(docs;
  verified: one file and one map entry changed, and direct loads and client-side
  navigation worked)**
- **Cost:** the map is inlined in `index.html`, which must not be cached. It
  adds about 85 bytes per chunk to every load and every popup window.
  **(verified)**
- **Caveat:** the keys look like file URLs that don't exist on the server.
  Anything that resolves modules without the page's map, such as a module worker
  importing shared chunks, needs checking. **(opinion)**
- An experimental flag pays off only once there are real users and frequent
  deploys; before that it is risk without benefit. Defer it with a written
  trigger, and put the trigger in the checklist of the event that fires it (the
  first production cutover), not only in the front-end docs. **(opinion)**

## Prove nothing visible changed

1. Build both versions with mocks. `vite build --mode development` keeps
   `NODE_ENV` production but loads the mock env file (see
   `mocks-out-of-production.md`).
2. Serve each build with `vite preview`. Pass `--base` when your config sets
   `base` only for `build`.
3. Open the same URLs in both and fingerprint every element: its box and key
   computed styles, hashed.

Equal hashes and no console errors mean no visible change. **(verified: 5 pages,
identical across three builds)** Leave tag names out of the fingerprint when the
change swaps elements on purpose, as in `form-labels.md`. **(opinion)**

```js
// evaluate in the page (DevTools, Playwright, chrome-devtools MCP) once it has rendered
const rows = [...document.querySelectorAll('body *')].map(e => {
  const r = e.getBoundingClientRect();
  const s = getComputedStyle(e);
  return [e.getAttribute('data-testid') ?? '', ...[r.x, r.y, r.width, r.height].map(Math.round),
    s.color, s.backgroundColor, s.fontFamily, s.fontSize, s.fontWeight,
    s.borderTopWidth, s.paddingTop, s.display].join('|');
});
let hash = 0;
for (const c of rows.join('\n')) hash = (hash * 31 + c.charCodeAt(0)) | 0;
({ elements: rows.length, hash });
```
