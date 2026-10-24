---
sources:
  - https://raw.githubusercontent.com/feature-sliced/documentation/master/src/content/docs/docs/reference/slices-segments.mdx
  - https://raw.githubusercontent.com/feature-sliced/documentation/master/src/content/docs/docs/reference/public-api.mdx
  - https://raw.githubusercontent.com/javierbrea/eslint-plugin-boundaries/master/packages/website/docs/rules/dependencies.md
  - https://raw.githubusercontent.com/javierbrea/eslint-plugin-boundaries/master/packages/website/docs/classification/elements.md
  - https://raw.githubusercontent.com/javierbrea/eslint-plugin-boundaries/master/packages/website/docs/guides/typescript-support.md
verified: 2026-10-24
status: proven
worth: A misconfigured eslint-plugin-boundaries setup passes silently; the canary test catches it, and the config was verified in three repos.
---

# FSD layer rules as ESLint errors

Feature-Sliced Design has two import rules. A slice imports other slices only from
layers strictly below its own, and only through their public API. **(docs)** This
pattern makes both rules `eslint-plugin-boundaries` errors. A person or an agent
then sees a violation in the editor or the commit hook, not in review.

It was checked on eslint-plugin-boundaries 7.2.0, ESLint 10.12 (flat config),
eslint-import-resolver-typescript 4.4.5 and TypeScript 6, in a React front-end
repo. The checks were a canary test against the real config, imports linted from
stdin, and a fixture tree. The rules were then switched on in two more front-end
repos. Every **(verified)** claim comes from those runs.

## When to use it, and when not

- **Use it** when the code already follows the FSD layout and lint runs in the
  editor, before each commit and in CI. **(opinion)**
- **Don't** turn it on before the layout exists. `no-unknown-files` fails every
  file outside the layer map, so move the files first. **(opinion)**

## The layer map: `eslint/fsd-boundaries.js`

```js
export const FSD_LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];

const SLICED_LAYERS = ['pages', 'widgets', 'features', 'entities'];

// Elements are folders (a slice, or the whole `app` / `shared` layer), so
// `fileInternalPath` is the path inside the slice and `index.ts` means its root.
export const boundariesElements = [
  { type: 'app', pattern: 'src/app', partialMatch: false },
  ...SLICED_LAYERS.map(layer => ({
    type: layer,
    pattern: `src/${layer}/*`,
    partialMatch: false,
    capture: ['slice'],
  })),
  { type: 'shared', pattern: 'src/shared', partialMatch: false },
];

const lowerLayers = layer => FSD_LAYERS.slice(FSD_LAYERS.indexOf(layer) + 1);

const publicApi = ['index.ts', 'index.tsx'];

export const boundariesPolicies = [
  // Down only, and into a slice only through its public API.
  ...FSD_LAYERS.filter(layer => lowerLayers(layer).length > 0).map(layer => ({
    from: { element: { type: layer } },
    allow: {
      to: lowerLayers(layer).map(target =>
        SLICED_LAYERS.includes(target)
          ? { element: { type: target, fileInternalPath: publicApi } }
          : { element: { type: target } },
      ),
    },
  })),
  // Sideways only inside the same slice.
  ...SLICED_LAYERS.map(layer => ({
    from: { element: { type: layer } },
    allow: {
      to: { element: { type: layer, captured: { slice: '{{from.captured.slice}}' } } },
    },
  })),
  { from: { element: { type: 'shared' } }, allow: { to: { element: { type: 'shared' } } } },
  { from: { element: { type: 'app' } }, allow: { to: { element: { type: 'app' } } } },

  // Optional: FSD `@x` cross-imports. `entities/a/@x/b.ts` is readable by `entities/b` only.
  {
    from: { element: { type: 'entities' } },
    allow: {
      to: { element: { type: 'entities', fileInternalPath: '@x/{{from.captured.slice}}.ts' } },
    },
  },
  // Optional: a slice's `mocks.ts` (test fixtures, MSW handlers) is readable from
  // `app/mocks/**` only, so it never reaches the production bundle.
  {
    from: { element: { type: 'app', fileInternalPath: 'mocks/**' } },
    allow: {
      to: SLICED_LAYERS.map(type => ({ element: { type, fileInternalPath: 'mocks.ts' } })),
    },
  },
];
```

## Wiring it into `eslint.config.mjs`

```js
import boundaries from 'eslint-plugin-boundaries';
import path from 'node:path';

import { boundariesElements, boundariesPolicies } from './eslint/fsd-boundaries.js';

// ...inside the config array:
{
  files: ['src/**/*.{ts,tsx}'],
  plugins: { boundaries },
  settings: {
    'boundaries/root-path': import.meta.dirname,
    'boundaries/elements': boundariesElements,
    'boundaries/ignore': ['src/**/*.test.{ts,tsx}', 'src/vite-env.d.ts'],
    'import/resolver': {
      typescript: { alwaysTryTypes: true, project: path.join(import.meta.dirname, 'tsconfig.app.json') },
    },
  },
  rules: {
    'boundaries/dependencies': ['error', { default: 'disallow', policies: boundariesPolicies }],
    'boundaries/no-unknown-files': 'error',
  },
},
```

Install `eslint-plugin-boundaries` and `eslint-import-resolver-typescript` as dev
dependencies. `import.meta.dirname` needs Node 20.11 or later.

### Variant: `shared` segments behind their index

If the code already imports `shared` as `@/shared/api` and never as
`@/shared/api/<file>`, make each segment an element and require its `index.ts`,
both from above and from other segments:

```js
{ type: 'shared', pattern: 'src/shared/*', partialMatch: false, capture: ['segment'] },

// In the downward policy, every lower layer now needs the public API:
//   to: lowerLayers(layer).map(target => ({ element: { type: target, fileInternalPath: publicApi } })),
// and inside `shared`:
{
  from: { element: { type: 'shared' } },
  allow: {
    to: [
      { element: { type: 'shared', captured: { segment: '{{from.captured.segment}}' } } },
      { element: { type: 'shared', fileInternalPath: publicApi } },
    ],
  },
},
```

**(verified: a feature importing `@/shared/api/<file>` fails, and `shared/ui` →
`@/shared/lib` passes)** Don't use it while deep `shared` imports are common:
every one of them fails at once, and segments without an `index.ts` need one
first. **(opinion)**

## Why it holds

- **It allows a short list and blocks the rest.** With `default: 'disallow'`, any
  dependency that no policy allows is an error. **(docs)** The only policy within
  a layer requires the same captured `slice`. Nothing allows a sideways import,
  so it fails, and a new slice needs no new rule. **(verified: sideways imports in
  all four sliced layers, upward imports and `shared` → `entities` all fail)**
- **It checks the file an import resolves to, not the import string.** A relative
  path can't get around it. `import type`, re-exports, `export *`, dynamic
  `import()` and side-effect imports are all checked. **(verified)**
- **Elements are folders.** `fileInternalPath` is then the path inside the slice,
  so `index.ts` means the slice root. A nested `model/index.ts` doesn't count as
  public API. **(docs; verified on a fixture)**
- **`no-unknown-files` catches a file outside the layer map**, such as a new
  `src/utils/`. **(verified)**

## Traps

- **Without the TypeScript resolver, every violation passes and nothing warns
  you.** `@/` aliases go unresolved, and so do relative `.ts` imports. The plugin
  skips imports it can't resolve, so the lint run is green. **(verified: with the
  resolver setting removed, six violations passed, one of them relative)** The
  plugin's TypeScript guide lists the resolver as required. **(docs)**
- **Relative paths in the config depend on where ESLint runs.** The setup tested
  had `project: './tsconfig.app.json'` and no `boundaries/root-path`. Linted from
  a parent folder (an editor opened above the repo, or a monorepo root), it found
  no violations. With `partialMatch: false` and no root path, every file failed
  `no-unknown-files` instead. Build both paths from `import.meta.dirname`.
  **(verified: CLI runs from the parent folder, before and after the change)**
  Passing `cwd` to the ESLint API doesn't reproduce the problem. Only the
  process's working directory does. **(verified)**
- **File-level element patterns open up the public API.** With `pattern:
  'src/features/*/**'` and `mode: 'full'`, every file is its own element and
  `fileInternalPath` is just the file name. Another slice's nested
  `model/index.ts` then passes as public API. **(verified on a fixture)** `mode`
  is also deprecated in v7 and prints a warning on every run. **(docs; verified)**
- **Set `partialMatch: false` explicitly.** The default matches the end of the
  path. The docs recommend `false` and expect the default to change in a future
  major version. **(docs)** With `false`, the same canary passed and the repo's
  `src` stayed lint-clean. **(verified)**
- **A second entry point is open to every importer unless a policy limits it.**
  When `mocks.ts` was in the public-API list, feature code could import the test
  fixtures. **(verified)** That would put the mock library in the production
  bundle. **(opinion)** The `mocks.ts` policy above allows it from `app/mocks/**`
  only. **(verified on a fixture, and on the real tree, where `app/mocks` was the
  only importer)**
- **Expect the first violation in the API client.** In both repos where the rules
  were switched on, the only error was `shared/api` importing the session entity
  to read the token and to log out on a failed 401. **(verified)** The fix: let
  `shared/api` export a setter, such as `configureApiSession({ getAccessToken,
  clearSession })`, and have `app` call it at module load. **(verified: lint and
  build pass, and the behaviour is unchanged)** Calling it from a hook's effect
  instead would let requests fire before the getter is set. **(opinion)**
- **eslint-plugin-boundaries 7.2.0 pulls in `handlebars` 4.7.9**, which has
  critical advisories, and `braces` (via `micromatch`), which has a high DoS
  advisory with no patched version. Use 7.3.0 or later: it ships `handlebars`
  4.7.10 and replaced `micromatch` with `picomatch`, so `braces` is gone.
  **(verified: `npm audit` on 2026-10-22 for 7.2.0; `npm view` and `npm audit`
  of a 7.3.0 lockfile on 2026-10-24, 0 advisories)** Before 7.3.0 the plugin
  used these only on patterns from your own config. **(opinion)** The checks
  above ran on 7.2.0; re-run the canary after upgrading. **(opinion)**

## The canary test

A broken resolver turns lint green, so lint itself can't report it. A test that
expects known-bad imports to fail can. **(verified: with the resolver removed,
every `rejects` case below failed, and with relative config paths the last case
failed)**

```js
import { ESLint } from 'eslint';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Known-bad imports linted against the real config. Use real slice names: the
// probe files need not exist, the import targets must.
const root = path.resolve(import.meta.dirname, '..');
const feature = path.join(root, 'src/features/checkout/model/probe.ts');
const entity = path.join(root, 'src/entities/product/model/probe.ts');
const eslint = new ESLint({ cwd: root });

const boundaryErrors = messages =>
  messages.map(m => m.ruleId).filter(id => id?.startsWith('boundaries/'));

const lint = async (filePath, source) => {
  const [result] = await eslint.lintText(`${source}\nexport const y = x;\n`, { filePath });

  return boundaryErrors(result.messages);
};

describe('fsd boundaries', { timeout: 60_000 }, () => {
  it.each([
    ['sideways', feature, "import { x } from '@/features/cart';"],
    ['sideways, by relative path', feature, "import { x } from '../../cart';"],
    ['upward', entity, "import { x } from '@/features/checkout';"],
    ['past the index', feature, "import { x } from '@/entities/product/model/types';"],
  ])('rejects %s', async (_, file, source) => {
    expect(await lint(file, source)).toEqual(['boundaries/dependencies']);
  });

  it('allows a lower slice through its index', async () => {
    expect(await lint(feature, "import { x } from '@/entities/product';")).toEqual([]);
  });

  it('rejects when ESLint runs from another folder', () => {
    const { stdout } = spawnSync(
      process.execPath,
      [path.join(root, 'node_modules/eslint/bin/eslint.js'), '--stdin', '--stdin-filename', feature, '--format', 'json'],
      { cwd: os.tmpdir(), input: "import { x } from '@/features/cart';\nexport const y = x;\n", encoding: 'utf8' },
    );

    expect(boundaryErrors(JSON.parse(stdout)[0].messages)).toEqual(['boundaries/dependencies']);
  });
});
```

- Import targets must exist. The plugin skips an import it can't resolve, so an
  `allows` case would pass for the wrong reason. **(verified: the `allows` case
  still passed with the resolver removed)**
- `src` usually has no nested `index.ts` to test against. Test that case on a
  fixture tree that has its own `tsconfig.json`, the same elements and policies,
  and `boundaries/root-path` set to the fixture. **(verified)**
- Check that the test runner picks up the file. A runner that only includes
  `src/**` won't run it. **(verified)**
- No test runner? Write the same cases with `node:test` and `node:assert`, and
  chain them into the lint script (`eslint . && node --test
  eslint/fsd-boundaries.test.js`) so they run wherever lint runs. No new
  dependency is needed. **(verified: 12 of 12 pass, and 8 of 12 fail with the
  resolver removed)**

## What lint can't tell you

- **Where the code should go instead.** When two slices of one layer need the same
  thing, move it down, not sideways. Domain types and labels go to the entity that
  owns them, domain-free helpers go to `shared`, and UI that several pages share
  goes to a feature. **(opinion)** Write this in the architecture doc that the
  lint error points readers to. Otherwise the quickest fix for a sideways error is
  to copy the code or move it into `shared`. **(opinion)**
- **Tests are exempt** (`boundaries/ignore`), so they can reach a slice's
  internals. This is a deliberate trade-off. **(opinion)**
- **Cross-imports between entities.** FSD allows them only through `@x` files,
  only on the entities layer, and recommends keeping them rare. **(docs)** The
  optional `@x` policy above enforces exactly that. **(verified on a fixture)**
