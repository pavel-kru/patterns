---
sources:
  - https://raw.githubusercontent.com/christoph-fricke/openapi-msw/main/README.md
verified: 2026-11-09
status: proven
worth: Mocks and API calls typed "from the spec" still let a wrong body, a missing required field or a wrong route through in four specific places; each was reproduced with a tsc probe and closed.
---

# Typing mocks and API calls from a generated OpenAPI contract

Stack: the backend publishes an OpenAPI spec (here ASP.NET with Swashbuckle),
the front end generates `paths` / `components` types from it with
openapi-typescript, mocks the API with MSW and calls it with axios. Aliasing
DTOs (`type Building = components['schemas']['BuildingResponseModel']`) is the
usual first step, and it leaves the two places drift actually happens untyped:
the **route** a call or a handler uses, and **which** type is bound to which
route (`axios.get<Building[]>('/buildings')` accepts any type argument).

## The shape that works

- **Mocks:** openapi-msw's `createOpenApiHttp<paths>({ baseUrl })`. A handler
  only accepts a path and verb the spec has, written as in the spec
  (`/items/{id}`), and `params`, `query`, `request.json()` and the response
  body are the generated types **(docs, verified: unknown path, wrong verb,
  unknown query key and wrong field type each failed tsc)**.
- **Client:** a thin typed layer over the existing axios instance, not a new
  HTTP client, so interceptors (session recovery, error-body parsing) stay.
  `apiRequest.get('/buildings', { query: { propertyId } })` returns the spec's
  200 body; path values go apart (`{ path: { id } }`) and are filled and
  encoded by the layer. About 60 lines of types:
  - paths for a verb: `{ [P in keyof paths]: paths[P] extends Record<M, unknown> ? P : never }[keyof paths]`.
    It works because openapi-typescript writes the verbs a path lacks as
    `put?: never`, and an optional key fails `Record<M, unknown>`
    **(verified: `post('/properties')` on a GET-only path fails tsc)**;
  - make the options argument optional only when nothing in it is required:
    `object extends Options ? [options?: Options] : [options: Options]`
    **(verified: a call without `{ path: { id } }` fails with "Expected 2
    arguments")**;
  - body = the `application/json` model, or `FormData` when the content is
    `multipart/form-data` **(verified: uploads type-check with FormData)**.
- Write the paths as **literals** at the call site and in the handler. Two
  independent spellings, both checked against the spec, catch each other; a
  path constant shared by client and mock would let both agree on a typo
  **(opinion)**.

## Traps (each one let a wrong mock or call through)

1. **The "response body" helper is the union of every status.** openapi-msw's
   `ResponseBodyFor` (and any "all responses" type) includes the error
   statuses. ASP.NET's `ProblemDetails` is all-optional fields **plus an index
   signature**, so almost any object is assignable to the union: a report-run
   mock wired to the wrong report still type-checked **(verified)**. Type
   success bodies as `responses[200]['content']['application/json']`
   (201 for creates, `void` for 204). Return errors through helpers typed as
   `ProblemDetails` so the error branch is checked too.
2. **A front type looser than the spec hides drift.** A shared front
   `RunResult` declared `totals?:` while every generated run response requires
   `totals: T | null`; mocks typed with the front type could omit it. Typing
   each mock's return with the generated 200 body made five mocks
   check against the real shape **(verified)**. Type mocks with the generated
   type, not with the front's convenience type.
3. **Swashbuckle declares file downloads as a JSON `string`**
   (`"application/json": string`) when the action returns a file without a
   `[Produces]` / `ProducesResponseType` of a binary type, while the server
   sends `application/octet-stream` **(verified in the generated spec)**.
   Keep downloads typed on path, query and body only: openapi-msw's
   `response.untyped(...)` in mocks **(docs)**, and a `download` variant of the
   client that returns the raw `Blob` response. Fixing the spec is a backend
   change.
4. **Request bodies and most request fields are optional** in a Swashbuckle
   spec (nullable or defaulted on the server), so a typed `request.json()` is
   `T | undefined` with optional fields **(verified)**. In a mock, assert the
   body; where the mock relies on the front always sending complete criteria,
   cast to the front's complete type (a cast still needs overlap, so it stays
   loosely checked).
5. **A generic template-literal path doesn't resolve.** A helper
   `<Slug>(slug: Slug) => http.post(`/report/${slug}/run`, …)` makes TS
   fail on the generic response type **(verified: TS2322 on
   `ResponseMap<paths, `/report/${Slug}/run`>`)**. Use the untyped `http`
   inside the helper and carry the check on its signature: constrain `Slug` to
   the slugs whose `/report/${Slug}/run` exists (extract them with
   `Path extends `/report/${infer S}/run` ? S : never`) and type the callback's
   return as that slug's 200 body.
6. **A route built from a `string` field can't be checked.** When a config
   object holds the route segment (`definition.slug: string`), every call built
   from it stays untyped. Type that field as a literal union so the config keeps
   each entry's literal (`satisfies` with a literal-union field keeps the
   literal) **(opinion: not applied yet)**; until then, leave those calls on the
   untyped client with a comment rather than casting the string to a spec path.

## Keep it honest

- Probe the types after wiring them: a scratch file with deliberately wrong
  calls (unknown path, wrong verb, wrong query key, missing path value, wrong
  response field, a callback bound to the wrong route) must produce one tsc
  error each **(verified: how traps 1 and 5 were found)**.
- Endpoints the backend doesn't have yet stay on the plain `http` / client with
  hand-written types and a marker, and move to the typed layer as part of
  shipping the endpoint.
- Add the typing library to the "mock code must not reach a production
  chunk" guard (see `mocks-out-of-production.md`).
