# Auth And Session

Use this when the site requires authentication or long-lived session reuse.

## Default Model

Prefer:

- runtime flags for explicit inputs
- environment variables for secrets when appropriate
- persisted session/auth material for reuse
- no general config file by default

When the site needs manual browser login and does not expose a direct auth input
such as an API key or auth token, prefer this model:

- `login --session-path <path>` performs Playwright login/bootstrap
- `login` writes the reusable session/auth material to that exact path
- every later authenticated command also requires `--session-path <path>`

## Storage Defaults

For the browser-login pattern above, never silently choose a storage path.
Require the user to provide one explicitly.

For other auth patterns, such as token-based auth or user-provided cookies,
user-local app/config storage may still be appropriate when persisted session
material is useful. Allow an override flag or environment variable for the
session path.

Good examples:

- Windows: `%APPDATA%\\<tool-name>\\session.json`
- macOS: `~/Library/Application Support/<tool-name>/session.json`
- Linux: `~/.config/<tool-name>/session.json`

## Supported Auth Patterns

Support the pattern that fits the site:

- manual login in a headed browser
- credentials or tokens provided via env vars or flags
- user-provided cookies or headers

## Browser State And Fetch

Do not assume a Playwright session or storage file can be handed directly to
plain `fetch`.

Determine exactly what later commands need at runtime:

- cookies
- authorization headers or bearer tokens
- CSRF values
- origin-scoped values from browser storage
- any other stable request inputs

If the saved browser state is not sufficient on its own, persist the additional
reusable auth material the runtime actually needs. Keep that material explicit,
minimal, and tied to the same `--session-path`.

If authenticated runtime access still depends on browser-managed state that
cannot be reconstructed safely outside the browser, do not pretend the hybrid
pattern works. Use Playwright runtime instead.

## Manual Login

If a browser login is needed:

1. open a headed Playwright session
2. ask the user to log in or complete MFA
3. require an explicit `--session-path` or equivalent flag
4. persist the resulting session/auth material at that path
5. prove how later commands derive their runtime auth inputs from that saved
   material
6. require later authenticated commands to reuse that same path

Prefer exposing this as an explicit CLI command, typically `login`, when the
website requires user authentication and no API key or similar direct auth path
exists.

That command should tell the user where the session was saved and keep the auth
dependency explicit in help text and examples.

For later commands, prefer a required `--session-path` flag over hidden config
lookup.

For hybrid designs, validate at least one authenticated request with plain
`fetch` before treating the saved session path as sufficient.

## User-Provided Cookies Or Headers

If the user can pass cookies or similar session material, tell them exactly what
to export and where to place it. Prefer concise operational guidance over long
explanations.

## Security Rules

- do not hardcode secrets
- do not store secrets in repo files by default
- do not print secrets in normal output
- do not print secrets in `--json` output
- keep secret handling explicit and minimal
