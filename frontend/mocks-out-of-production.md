---
sources:
  - https://raw.githubusercontent.com/vitejs/vite/main/docs/guide/env-and-mode.md
verified: 2026-10-23
status: proven
worth: A mock-server flag read through a config object ships the whole mock chunk in every production build unnoticed; the guard turns that into a failed build.
---

# Mock server out of production builds

An SPA that develops against a browser mock server (a service worker plus
request handlers, MSW style) starts it behind an env flag. Production builds
must contain none of it, and the build should fail if they ever do. Checked on
Vite 8; applied and merged. **(verified)**

## The leak nobody sees

- The flag was read through a config object:
  `ENV = { useMocks: import.meta.env.VITE_USE_MOCKS === 'true' }`, then
  `if (ENV.useMocks) await import('./mocks/start')`. The bundler doesn't fold a
  property read through an object, so the dynamic import survives, and every
  production build emits the mock chunk with the mock library, the handlers and
  the fixtures (478 kB raw here). The chunk is never loaded, so nothing looks
  wrong. **(verified)**
- The worker script that the mock library keeps in `public/` is copied into
  every build as well. **(verified)**

## Fix

- Compare the env variable at the import site:
  `if (import.meta.env.VITE_USE_MOCKS === 'true')`. Vite replaces
  `import.meta.env.*` statically, so the comparison folds to `false` and the
  branch is dropped together with its dynamic import. **(docs; verified: the
  chunk is gone, and the JS in `dist` went from 1675 to 1198 kB)**
- Add a build plugin that runs only when mocks are off. It fails the build if
  mock code reaches any chunk, and removes the worker script:

```ts
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** The mock library and our handlers/fixtures (`app/mocks`, `<slice>/mocks`, `mocks.ts`). */
const MOCK_MODULE = /[\\/](?:node_modules[\\/](?:msw|@mswjs)[\\/]|src[\\/].*\bmocks\b)/;

const noMocksInBuild = (): Plugin => ({
  name: 'no-mocks-in-build',
  apply: 'build',
  generateBundle(_options, bundle) {
    const leaked = Object.values(bundle).flatMap(out =>
      out.type === 'chunk'
        ? out.moduleIds.filter(id => MOCK_MODULE.test(id)).map(id => `${out.fileName} ← ${id}`)
        : [],
    );
    if (leaked.length) this.error(`Mock code in a build without mocks:\n${leaked.slice(0, 10).join('\n')}`);
  },
  async writeBundle({ dir }) {
    if (dir) await rm(resolve(dir, 'mockServiceWorker.js'), { force: true });
  },
});

// in defineConfig(({ mode }) => …), env = loadEnv(mode, process.cwd(), '')
plugins: [react(), ...(env.VITE_USE_MOCKS === 'true' ? [] : [noMocksInBuild()])],
```

- `public/` is already copied when `writeBundle` runs. **(verified on Vite 8)**
- Prove the guard works: put the old gate back in a throwaway `git worktree`
  and build. The build must fail, naming the chunk and the mock modules in it.
  **(verified)**
- The dev server and mock-enabled builds are untouched, because the plugin
  applies only to builds without mocks. **(verified)**

## Smoke-testing the real bundle without a backend

`vite build --mode development` keeps `NODE_ENV` production but loads
`.env.development`, where the mock flag is on. You get the minified, tree-shaken
bundle running against the mocks, which is the right thing to smoke-test bundle
changes against. Serve it with `vite preview`. **(docs; verified)**
