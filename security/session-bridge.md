---
sources:
  - https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.md
  - https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/http/reference/headers/set-cookie/index.md
verified: 2026-10-24
status: candidate
worth: Handing a legacy server session to a new SPA and API has easy-to-miss holes (login CSRF, token replay, tokens in JS), checked against OWASP.
---

# Session bridge: hand a legacy session to an SPA without tokens in JS

A legacy server-rendered app owns sign-in and its own session. A new SPA and a new
API join it on the same origin, and the API needs a session of its own. The bridge
hands the user over with a one-time token, and the API answers with its own
HttpOnly cookie. Nothing long-lived ever reaches JavaScript.

This is a review of one implementation against the sources above, not something
run end to end here.

## When to use it, and when not

- **Use it** during a migration where two apps keep two session systems on one
  origin. **(opinion)**
- **Don't** when one app owns both sign-in and the API. Let the API accept that
  session directly, with CSRF protection: there is nothing to hand over.
  **(opinion)**
- **Don't** when sign-in lives in an OAuth/OIDC server. The bridge is a home-grown
  authorization code; use the standard code flow in a BFF instead. **(opinion)**

## Flow

1. The SPA asks the legacy app for a bridge token with a `POST` that carries the
   legacy session cookie. The legacy app stores `{token_hash, legacy_session_hash,
   user, tenant, expires_at = now + 30 s, consumed_at = NULL}` and returns the
   token with `Cache-Control: no-store`.
2. The SPA sends the token to the API's exchange endpoint. The API checks and
   burns it in one statement:

   ```sql
   UPDATE bridge_tokens
      SET consumed_at = now()
    WHERE token_hash = :token_hash
      AND legacy_session_hash = :hash_of_the_legacy_cookie_on_this_request
      AND consumed_at IS NULL
      AND expires_at > now()
   RETURNING user_name, tenant;  -- SQL Server: OUTPUT inserted.user_name, inserted.tenant
   ```

   No row means 401.
3. The API sets its own session cookie: a `__Host-` name, `HttpOnly`, `Secure`,
   `Path=/`, `SameSite=Lax`.

## Why the core holds

- One statement checks and burns the token, so two concurrent exchanges can't
  both succeed, and only the database clock decides expiry. **(opinion: relies on
  the database applying a single `UPDATE` to a row atomically)**
- A single-use token that lives 30 seconds is worth almost nothing if it leaks
  from JS. **(opinion)**
- One origin: no CORS, and the cookie is first-party. **(opinion)**

## What a naive version misses

1. **Login CSRF.** Without the `legacy_session_hash` check, an attacker takes a
   bridge token from *their own* session and makes the victim's browser post it,
   for example with an auto-submitting form on another site. The victim then
   works in the SPA as the attacker, and whatever they enter lands in the
   attacker's account. **(docs: OWASP, "Possible CSRF Vulnerabilities in Login
   Forms")** `SameSite` on the new cookie doesn't help: the form post is a
   top-level navigation to our origin, so the cookie it gets back is first-party.
   **(opinion, not tested)** Fix: bind the token to the session that created it,
   and reject exchange requests unless `Sec-Fetch-Site` is `same-origin`, with an
   `Origin` check as the fallback when the header is missing. **(docs: OWASP,
   Fetch Metadata and standard headers)**
2. **Two sessions drift apart.** Signing out of the legacy app doesn't end the API
   session, and the reverse. Worst case: in a frameset someone signs out of the
   legacy app and another user signs in, while the SPA frame still runs as the
   first one. Fix: keep the legacy session hash in the API session and compare it
   on every request, or at least when the SPA loads; have legacy sign-out revoke
   the API session; align the idle timeouts. **(opinion)**
3. **The bridge endpoint changes state.** Use `POST` or require a custom header.
   **(docs: OWASP)** Rate-limit it, never log the token, purge expired rows.
   **(opinion)** `SameSite=Lax` still lets top-level `GET`s through, so a `GET`
   must never change state. **(docs: OWASP, MDN)**
4. **A cookie-authenticated API needs CSRF protection beyond `SameSite`.**
   `SameSite` works per site, so sibling subdomains count as same-site. Accept a
   state-changing request only with `Sec-Fetch-Site: same-origin`. When the
   header is missing, require a matching `Origin` (or `Referer`) and reject if
   neither is present, or use a CSRF token. **(docs: OWASP)**
5. **Cookie prefix.** A `__Host-` name forces `Secure` and `Path=/` and forbids
   `Domain`, so another subdomain can't set or overwrite the cookie. It needs
   HTTPS. **(docs: MDN)**
6. **The origin is shared with the legacy pages.** XSS on any legacy page can now
   call the new API as the user. Put a CSP on the SPA paths and audit the legacy
   pages. Only separate origins remove this, and they remove the point of the
   bridge too. **(opinion)**
7. **The rest.** Generate the token with a CSPRNG, at least 128 bits, and store
   only its hash. If the API session is a self-contained encrypted cookie rather
   than a server-side session, revoking it needs a version or security-stamp
   check, or it lives until it expires. Take the tenant from the session only,
   never from client input. **(opinion)**
