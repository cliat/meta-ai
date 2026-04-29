# Investigation Workflow

Use this before implementing the generated CLI.

## Goal

Determine whether the target workflow can run with direct HTTP calls, needs a
hybrid auth/bootstrap approach, or requires Playwright runtime.

Default to Chromium for investigation unless the user requests another browser
or there is a strong, concrete compatibility reason to use a different one.

## Steps

1. Define the exact user goal and target commands.
2. Open the site with `playwright-cli`.
3. Ask the user to log in or complete MFA when needed.
4. Reproduce one real happy-path run.
5. Watch browser state and network traffic.
6. Inspect the likely transports for the real business action: REST/XHR/fetch,
   GraphQL, WebSocket, SSE, polling, and direct download endpoints when present.
7. Identify the UI controls that materially affect the action.
8. Identify the requests or message flows that correspond to the real business
   action.
9. Test whether those requests or message flows are reproducible outside the
   browser.
10. If auth is involved, prove how saved browser-auth state maps into runtime
   request inputs.
11. Decide on `fetch`, hybrid, or Playwright runtime.
12. Clean up temporary investigation session data.

## Use With playwright-cli

Prefer these capabilities during investigation:

- `playwright-cli open`
- `playwright-cli snapshot`
- `playwright-cli network`
- `playwright-cli tracing-start`
- `playwright-cli tracing-stop`
- `playwright-cli state-save`
- `playwright-cli cookie-list`
- `playwright-cli localstorage-list`
- `playwright-cli sessionstorage-list`
- `playwright-cli run-code`

Use tracing when quick inspection is not enough. The trace is useful for request
timing, request bodies, and download behavior.

## What To Capture

Capture a concise summary, not raw noise:

- relevant endpoint URLs and methods
- which transport is actually carrying the business action: REST/XHR/fetch,
  GraphQL, WebSocket, SSE, polling, or direct downloads
- request bodies and stable identifiers
- required headers, cookies, tokens, and CSRF values
- how saved browser-auth state is transformed into runtime request inputs
- whether polling is required
- whether downloads are direct URLs or mediated requests
- whether auth state can be reused outside the browser
- which UI controls should become CLI parameters
- which UI controls should stay out of the CLI because they are noisy, unstable,
  or low-value

## UI Controls To CLI Flags

When the action UI exposes options, toggles, presets, or other knobs, treat them
as candidate CLI parameters.

Prefer exposing controls that:

- materially change the outcome
- are likely to be reused
- map cleanly to stable request fields or browser actions

Avoid exposing controls that are:

- cosmetic or UI-only
- unstable or hard to automate reliably
- unlikely to matter for repeated CLI usage

Before finalizing the generated commands, propose a concise mapping from
important UI controls to CLI flags.

Also define how commands compose with each other:

- which command emits the stable identifier
- which later commands accept it
- which commands must remain non-interactive after auth bootstrap

## Ask The User For Help When Needed

Ask for user assistance if the flow requires:

- manual login
- MFA or checkpoint completion
- selecting the exact workflow to automate
- sample prompts, files, or other inputs
- copied cookies or headers

## Cleanup

After investigation, remove temporary Playwright session artifacts created only
for discovery, such as throwaway browser profiles or saved state files.

Do not keep investigation session data by default. Preserve session material
only when:

- it is intentionally reused by the generated CLI
- the user asked to keep it
- it is part of the validated auth/bootstrap flow

## Decision Boundary

Do not settle for Playwright runtime just because the site is JS-rendered.
JS-rendered UIs often still rely on backend requests that can be driven with
`fetch`.

Do not choose Playwright runtime until the likely non-browser runtime paths have
been checked carefully. That includes REST/XHR/fetch, GraphQL, WebSocket, SSE,
polling, and any direct or signed download endpoints the site uses.

Do not settle for the hybrid path merely because login can be done in
Playwright. The hybrid path is only proven when later authenticated requests
work with documented `fetch` construction from saved session material.
