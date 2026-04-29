# CLI Command Patterns

Use this reference when designing the command surface for a CLI generated with
`clifier`. For final output and documentation deliverables, read
[output-and-docs.md](output-and-docs.md). For Deno-generated tools, prefer
`@cliffy/command` to implement the command tree, shared flags, arguments, and
generated help.

When the generated package exposes both a client library and a CLI, keep the
package root for the library and publish the CLI from `./cli` so users import
`jsr:@scope/package` and run `deno x jsr:@scope/package/cli`.

## Contents

- Mental Model
- Help Is Interface
- Prefer This Command Shape
- Discovery, Resolve, Read, Context
- Website Automation Rules
- Text, JSON, Files, Exit Codes
- Pagination And Breadth
- Raw Escape Hatch
- Commands Reference Pattern

## Mental Model

The CLI is the agent-facing command layer for the target website, app, or
service. It should turn the real workflow into repeatable shell commands an
agent can run from any repo.

Prefer composable primitives over a single command that tries to do everything.
Good generated CLIs expose discover, resolve, read, create, download, upload,
inspect, and context commands that can be chained together.

When the package also ships a client library, keep command handlers thin by
calling library methods instead of duplicating request logic inside the CLI.

## Help Is Interface

Write `--help` for a future agent session that only has the binary and a vague
task.

When using `@cliffy/command`, let the framework generate the baseline help and
make it useful by filling in command descriptions, argument names, and examples.

Good help should feel polished and low-friction. Users should be able to infer
the main workflow quickly without reading long prose.

Good top-level help should answer:

- what containers or broad resources can I discover
- what exact objects can I read
- what stable IDs can I resolve
- what files can I download or upload
- which write actions exist
- what the raw escape hatch is

## Prefer This Command Shape

Prefer product nouns, then verbs. Keep the style consistent across the tool.

Favor commands and flags that users can predict from the product vocabulary
without memorizing special agent-only abstractions.

With `@cliffy/command`, model noun-then-verb commands as nested subcommands and
shared flags such as `--json` as global options.

```bash
tool-name --json doctor
tool-name --json login --session-path ./session.json
tool-name --json accounts list
tool-name --json models list
tool-name --json jobs create --input-file prompt.json
tool-name --json jobs get <job-id>
tool-name --json jobs download <job-id> --out ./downloads
tool-name --json media upload --file ./image.png
tool-name --json request get /api/me
```

Top-level verbs are still fine for cross-cutting commands such as `doctor` or
`login`, or when the product vocabulary makes that clearly better.

Only keep `doctor` if the tool has real diagnostics to report. Only keep `login`
if the site actually needs explicit auth or bootstrap setup.

## Discovery, Resolve, Read, Context

Design first-pass commands in this order:

1. discover broad containers or top-level resources
2. resolve human input into stable IDs
3. read an exact object by ID
4. fetch context around an anchor when that helps the workflow

For website automation, common shapes include:

- `accounts list`
- `projects list`
- `models list`
- `jobs create`
- `jobs get`
- `jobs events`
- `jobs download`
- `messages search`
- `messages context`

Do not force repeated fuzzy search when an earlier command can emit a stable ID
that later commands can accept directly.

## Website Automation Rules

- map real UI controls, toggles, presets, and fields to explicit CLI flags
  before finalizing the surface
- keep operational commands non-interactive after auth/bootstrap is complete
- have create-style commands emit stable IDs
- make later read, status, or download commands accept those same IDs directly
- require an explicit `--out` flag for file-producing commands
- when browser-auth reuse is required, make `--session-path` explicit on `login`
  and later authenticated commands
- avoid a generic `run-workflow` command when smaller commands compose better

## Text, JSON, Files, Exit Codes

Support human-readable output by default when it helps. Support `--json`
everywhere an agent will parse or pipe results.

If a command depends on a non-bundled runtime dependency, fail fast when that
dependency is missing and tell the user exactly how to install it.

For `--json`:

- emit JSON to stdout only
- send diagnostics and progress to stderr
- keep success and error shapes documented
- redact tokens, cookies, CSRF values, private headers, and unrelated payloads

For downloads and exports:

- write files under a user-provided `--out` path when possible
- in JSON output, return the file path, byte count when cheap, source URL or ID,
  and the obvious follow-up command when useful

For exit codes:

- exit zero when the command succeeded, including empty results
- exit nonzero for auth failure, invalid input, network failure, parse failure,
  API error, or incomplete upload/download
- exit nonzero for missing mandatory runtime dependencies
- keep `doctor --json` usable even when auth is missing

## Pagination And Breadth

Start shallow by default. Add explicit knobs for breadth.

```bash
tool-name --json jobs list --limit 10
tool-name --json jobs list --limit 50 --all-pages --max-pages 3
tool-name --json messages search "topic" --limit 20
```

Return the real pagination shape from the provider, such as `next_cursor`,
`next_url`, `offset`, or `page_count`.

## Raw Escape Hatch

The raw command is a repair hatch, not the main interface.

Good raw commands still use configured auth, base URL handling, JSON parsing,
redaction, status handling, and `--json`.

Prefer simple read shapes:

```bash
tool-name --json request get /api/me
tool-name --json request get /api/jobs/<job-id>
```

Treat raw writes as real writes. Do not hide live `POST`, `PUT`, `PATCH`, or
`DELETE` operations behind a vague debug command.

## Commands Reference Pattern

Every generated tool should ship with a compact commands reference that is
shorter than the full README and easy to hand to another agent.

Keep it operational:

- start with bootstrap or diagnostic commands when they exist
- show the main happy-path commands in execution order
- keep each example on its own line
- end with a short rules block for parsing, destructive actions, and raw escape
  hatches

Typical shape:

```txt
Start with:
tool-name --json login --session-path ./session.json
tool-name --json accounts list

Common workflow:
tool-name --json jobs create ...
tool-name --json jobs get <job-id>
tool-name --json jobs download <job-id> --out ./downloads

Rules:

- prefer installed `tool-name` on PATH
- use `--json` when parsing output
- create drafts or non-destructive operations by default
- do not publish, delete, retry, submit, or overwrite unless the user asked
- use `request get ...` only when higher-level commands are missing
```
