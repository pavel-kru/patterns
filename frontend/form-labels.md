---
sources:
  - https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/html/reference/elements/label/index.md
  - https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/accessibility/aria/reference/roles/group_role/index.md
  - https://raw.githubusercontent.com/reactjs/react.dev/main/src/content/reference/react/useId.md
verified: 2026-10-23
status: proven
worth: Chrome form issues are easy to misread (they flag orphaned labels, not unlabelled fields), and a CSS-in-JS label can silently lose htmlFor and leave a control unnamed.
---

# Form labels that Chrome, screen readers and tests agree on

Report-style criteria forms (radio groups, checkbox groups, selects, date boxes)
built from shared primitives. Fixed across ten pages of a React SPA and merged;
Chrome's Issues panel went from 4 + 2 and 7 + 2 to nothing. **(verified)**

## What Chrome's two form issues actually mean

- **"No label associated with a form field"** flags a `<label>` element that is
  tied to no control: its `for` matches no labelable element and it contains no
  control. It doesn't flag a control without a label. The issue's own text says
  "A `<label>` isn't associated with a form field". A control named only by
  `aria-label` passes this check. **(verified)**
- **"A form field element should have an id or name attribute"** flags rendered
  fields with neither. Fields that aren't rendered (`<input hidden>`) aren't
  counted. **(verified)**
- The issues appear a few seconds after load. Wait before reading them, page by
  page. **(verified)**
- Misreading the first issue sends you hunting for the wrong elements: here the
  counts matched a "fields without a label" audit by coincidence. **(verified)**

## An audit that reproduces Chrome's counts

```js
// evaluate in the page after it has rendered
const LABELABLE = 'input:not([type=hidden]), select, textarea, button, meter, output, progress';
const where = el => el.closest('[data-testid]')?.getAttribute('data-testid') ?? el.tagName;
const fields = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')]
  .filter(el => el.getClientRects().length > 0);
const labelled = el => (el.id && [...document.querySelectorAll('label')].some(l => l.htmlFor === el.id))
  || el.closest('label') || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
({
  orphanLabels: [...document.querySelectorAll('label')]
    .filter(l => !document.getElementById(l.htmlFor)?.matches(LABELABLE) && !l.querySelector(LABELABLE))
    .map(l => `${l.textContent.trim()} @ ${where(l)}`),
  noIdOrName: fields.filter(el => !el.id && !el.getAttribute('name')).map(where),
  nameless: fields.filter(el => !labelled(el)).map(where),
});
```

On every page it matched Chrome's numbers exactly. Run it across all pages
through client-side navigation to size the problem before writing the ticket.
**(verified)**

## Three causes, three fixes

1. **A field wrapper renders a `<label>` for a group caption.** A `FormField`
   with no `htmlFor` captions a group (radios, checkboxes, a composite picker),
   but it rendered the caption as a `<label>` pointing at nothing. Without
   `htmlFor`, render the caption as a `<span>` with an id instead, and make the
   wrapper `role="group"` with `aria-labelledby` pointing at the span. Screen
   readers then announce the group. Give empty spacer captions no role. Style
   the caption as the wrapper's first child, so the `<label>` and `<span>` forms
   look the same. **(docs: `group` is the ARIA counterpart of `<fieldset>`;
   verified: 20 orphan labels went to 0, screenshots identical)**
   `<fieldset>`/`<legend>` is the native alternative when the layout allows it.
   Here the wrapper could be a `display: contents` grid cell, so the role went
   on the existing element. **(opinion)**
2. **Primitives without ids.** The select, text and date inputs rendered no id
   unless the caller passed one. Default it with `useId()`, and let a passed id
   win. That fixes every caller at once, including future ones. **(docs;
   verified with tests)**
3. **A CSS-in-JS label that loses `for`.** Some CSS-in-JS libraries forward only
   the attributes they know to the DOM, and `htmlFor` isn't one of them. A
   styled `<label htmlFor>` then renders without `for`, the label is orphaned,
   and its control has no name at all. Check the DOM for the `for` attribute,
   and render a plain `<label>` inside the styled wrapper. **(verified with one
   such library)**

## Keep the tests honest

- Before renaming anything, check how the e2e suite finds these controls. Here
  it used test ids, so swapping elements was safe. Its `label` lookups were
  scoped to radio-group ids, so the group captions were never part of them.
  **(verified)**
- Testing Library's `getByLabelText` matches the name exactly by default, so a
  caption with a trailing colon changes `As Of` to `As Of:`. Mind this when an
  `aria-label` gives way to a visible label. **(verified)**
- Pin the bug that mattered with
  `expect(field).toHaveAccessibleName('To:')`. It fails before the fix.
  **(verified)**
