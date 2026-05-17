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

- `login` performs `playwright-cli` login/bootstrap and writes reusable
  session/auth material to the default session path
- the default path is `~/.auth/<project_namespace>@<project_repo>.json`
- for a JSR package name such as `@acme/my-tool`, use
  `~/.auth/acme@my-tool.json`
- `--session-path, -s <path>` overrides the default on `login` and later
  authenticated commands

## Storage Defaults

For the browser-login pattern above, use
`~/.auth/<project_namespace>@<project_repo>.json` by default. This default is
part of the generated tool's documented contract, not a hidden config lookup.

In generated Deno tools, resolve `~` through the OS home directory before
reading or writing the session file. Prefer `Deno.env.get("HOME")` on Unix-like
systems and `Deno.env.get("USERPROFILE")` on Windows, with clear errors when no
home directory can be determined.

Keep `--session-path, -s <path>` as the explicit override. If the user supplies
it, read and write the session/auth material at that exact path.

For other auth patterns, such as token-based auth or user-provided cookies,
user-local app/config storage may still be appropriate when persisted session
material is useful. Allow an override flag or environment variable for the
session path.

## Supported Auth Patterns

Support the pattern that fits the site:

- manual login in a headed browser
- automatic local browser cookie discovery
- credentials or tokens provided via env vars or flags
- user-provided cookies or headers

## Auth Command Groups

When a tool has more than one auth bootstrap method, prefer an `auth` noun group
instead of a single top-level `login` command:

- `auth` chooses the best supported bootstrap method for the target site
- `auth login` performs manual `playwright-cli` login/bootstrap
- `auth get-cookies` imports an existing local browser session

Use `auth get-cookies` as the `auth` default only when it has been proven
against the target site on the current machine. Otherwise, print a concise
fallback that points to `auth login`.

Keep `--session-path, -s <path>` as a global override for `auth`, `auth login`,
`auth get-cookies`, and later authenticated commands.

## Local Browser Cookie Discovery

For Deno and TypeScript CLIs, use `npm:@rookie-rs/api` for automatic local
browser cookie discovery unless a project-specific reason requires another
approach.

When implementing `auth get-cookies`:

- try supported installed browsers and profiles unless the user supplied
  `--browser` or `--profile`
- stop at the first session that is proven usable for the target site
- store only the cookies and minimal metadata needed by later commands
- keep cookie extraction in the CLI/session layer, not the runtime-neutral
  client library
- never print cookie values, tokens, CSRF values, or private headers
- report platform, browser, profile, permission, and encryption limitations as
  clear runtime errors

Successful cookie extraction is not enough. The extracted cookies must either
authenticate a real harmless target-site request with `fetch`, or be injected
into a `playwright-cli` browser context that opens the target site already
authenticated.

## Browser State And Fetch

Do not assume a browser session or storage file can be handed directly to plain
`fetch`.

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
pattern works. Use `playwright-cli`-backed browser automation instead.

## Manual Login

If a browser login is needed:

1. open a headed `playwright-cli` session
2. ask the user to log in or complete MFA
3. choose the documented default session path unless `--session-path, -s`
   overrides it
4. persist the resulting session/auth material at the chosen path
5. prove how later commands derive their runtime auth inputs from that saved
   material
6. make later authenticated commands use the same default path unless
   `--session-path, -s` overrides it

Prefer exposing this as an explicit CLI command, typically `login`, when the
website requires user authentication and no API key or similar direct auth path
exists.

That command should tell the user where the session was saved and keep the auth
dependency explicit in help text and examples.

For later commands, keep the default path documented in `--help`, `README.md`,
and `COMMANDS.md`, and show `--session-path, -s` as the override.

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
