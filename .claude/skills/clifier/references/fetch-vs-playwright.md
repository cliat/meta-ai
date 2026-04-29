# Fetch Vs Playwright

Default preference order:

1. `fetch`
2. Playwright for auth/bootstrap plus `fetch` for runtime
3. Playwright runtime

## Choose Fetch When

- the business action maps to stable HTTP requests
- auth state can be reused as cookies, headers, or tokens
- the request and polling flow can be reproduced outside the browser
- downloads can be retrieved from direct or signed endpoints

Before rejecting `fetch`, inspect the likely transport carrying the action:
REST/XHR/fetch, GraphQL, WebSocket, SSE, polling, and any direct or signed
download path the site uses.

## Choose Hybrid When

- the site requires a browser for initial login or session bootstrap
- the operational requests are still reproducible outside the browser
- session material can be saved and reused later
- the saved session material can be translated into the runtime cookies,
  headers, tokens, CSRF values, or other inputs that `fetch` needs

Typical pattern:

- `login --session-path <path>` uses headed Playwright
- later authenticated commands require the same `--session-path <path>`
- operational commands use `fetch`

## Hybrid Validation

Before calling a hybrid design production-ready, prove at least one
authenticated `fetch` request using only the persisted session material and the
documented runtime request construction.

Capture:

- which fields from the saved session material are used at runtime
- which cookies, headers, tokens, CSRF values, or other inputs are derived from
  it
- whether supplemental auth data beyond Playwright storage state is required

If you cannot make a real authenticated `fetch` request work from the persisted
session material, hybrid is still unproven. Investigate further or choose
Playwright runtime.

## Choose Playwright Runtime When

- the workflow depends on browser-managed state that cannot be reproduced safely
- the site requires repeated UI interactions with no stable request contract
- downloads or actions are only exposed through browser events or complex page
  scripts
- `fetch` has been investigated seriously and is still not viable

When Playwright runtime is required, default to Chromium unless the user asks
for another browser or a different browser has been shown to be materially more
reliable for the target site.

## Required Explanation

When choosing the runtime, explain briefly:

- what was investigated
- why `fetch` is viable or not viable
- how auth is constructed at runtime when using the hybrid path
- why the chosen approach is the simplest robust option

## Avoid

- defaulting to Playwright because it feels easier
- concluding that `fetch` is not viable before checking the real request or
  message transport carefully
- generating both architectures when one clear choice exists
- claiming a flow is production-ready if critical runtime assumptions are still
  unproven
