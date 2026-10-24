---
sources:
  - https://raw.githubusercontent.com/eslint/eslint/main/docs/src/rules/no-restricted-imports.md
  - https://raw.githubusercontent.com/eslint/eslint/main/docs/src/rules/no-restricted-syntax.md
verified: 2026-10-22
status: candidate
worth: Two core ESLint rules keep logic out of components without a plugin, and a shrinking exception list makes the rollout feasible; verified in two repos.
---

# Render-only components, enforced by lint

In a Feature-Sliced Design front end, a slice's `ui/` components render what they
get. State, effects, queries, store reads, navigation and API calls live in the
slice's `model/` hooks, and the component calls `useTranslation` and those hooks.
Writing this down doesn't hold for long. Two ESLint core rules, scoped to slice
`ui/` folders, enforce the mechanical part. **(opinion)**

It was checked on ESLint 10 (flat config) in two React front-end repos. One
already followed the rule and showed 0 errors. The other had 26 errors in 7 of 9
component files; six files were migrated and one was listed as an exception.

## The rules

```js
export const sliceUiFiles = ['src/{pages,widgets,features,entities}/*/ui/**/*.{ts,tsx}']

const inModel = (what) => `${what} go in a model/ hook; the component only renders.`

export const uiLogicRules = {
  'no-restricted-imports': ['error', {
    paths: [
      { name: '@tanstack/react-query', message: inModel('Queries and mutations') },
      { name: 'axios', message: inModel('HTTP calls') },
      { name: 'zustand', message: inModel('Stores') },
      { name: 'react-router-dom', importNames: ['useNavigate', 'useSearchParams', 'useParams', 'useLocation'],
        message: inModel('Navigation and URL state') },
    ],
    patterns: [
      { group: ['../api', '../api/*', '../../api', '../../api/*', '@/shared/api', '@/shared/api/*'],
        allowTypeImports: true, message: inModel('API calls') },
      { group: ['@/entities/*'], importNamePattern: '^use.+Store$', message: inModel('Store reads') },
    ],
  }],
  'no-restricted-syntax': ['error',
    { selector: 'CallExpression[callee.name=/^use(State|Reducer|Effect|LayoutEffect)$/]', message: inModel('State and effects') },
    { selector: 'CallExpression[callee.property.name=/^use(State|Reducer|Effect|LayoutEffect)$/]', message: inModel('State and effects') },
  ],
}

// eslint.config.js
{ files: sliceUiFiles, ignores: [/* not migrated yet; this list only shrinks */], rules: uiLogicRules }
```

- `shared/ui` is outside the glob on purpose: primitives such as a bottom sheet
  keep their own open/closed state. **(opinion)**
- The second `no-restricted-syntax` selector catches `React.useState(...)`.
  **(verified)**
- `allowTypeImports` lets a component take a generated API type for its props.
  **(docs; verified)**

## Rolling it out to a repo that doesn't comply

- Turn the rule on as an error and list the files that fail in `ignores`. New
  components must comply from day one, and the list only shrinks. `warn` gets
  ignored. **(opinion)**
- The migration is mechanical. Move the hook calls, unchanged and with the same
  dependency arrays, into `model/use-<slice>-<purpose>.ts`, and return what the
  JSX needs. Display choices become model functions that return i18n keys.
  **(verified: six components moved; lint, build and a headless-browser render of
  each page showed the same states)**
- Leave a file in `ignores` while another open branch edits it, or the refactor
  turns that branch's change into a conflict. **(opinion)**

## Canary

A wrong glob checks nothing, and lint stays green. Lint known-bad probes (such as
`useState` in `src/pages/<slice>/ui/probe.tsx`) with the ESLint API, and expect
one error each. Add allowed cases too: state in a `model/` hook, and state in
`shared/ui`. **(verified: with the glob broken, 6 of 10 cases failed)** See
`fsd-boundaries.md` for the canary setup.

## What lint can't see

Plain logic inside a component, such as calculations, formatting or branching
rules. It belongs in `model/` too, and that part stays with the docs and review.
**(opinion)**
