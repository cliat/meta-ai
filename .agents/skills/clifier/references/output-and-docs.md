# Output And Docs

Use this after command design is settled. For command naming, help shape, and
command examples, read [cli-command-patterns.md](cli-command-patterns.md).

Every generated CLI should be usable by both humans and agents.

Bias toward concise, polished output. The tool should feel intentional and easy
to scan, not like a raw debugging harness.

For Deno-generated tools built with `@cliffy/command`, treat the generated help
output as the baseline interface and improve it with clear names, descriptions,
and examples.

For JSR-ready packages that ship both a library and a CLI, also include concise
publish and run notes:

- how to run locally
- how to import the client library from `jsr:@scope/package`
- how to publish with `deno publish --dry-run` and `deno publish`
- how to run the published CLI with `deno x jsr:@scope/package/cli`
- how to install the published CLI globally when that is useful

## Output Rules

- human-readable output is the default
- keep human-readable output concise and focused on the result, key identifiers,
  and the obvious next step
- every command supports `--json`
- `--json` emits schema-stable objects or arrays, not prose
- write machine-readable output to stdout only
- write diagnostics and errors to stderr
- use stable field names and identifiers that later commands can accept directly
- document whether `--json` is a CLI-shaped envelope or provider pass-through
  when that is not obvious
- exit zero on success, including empty results
- exit nonzero on auth failure, invalid input, network failure, parse failure,
  API error, or incomplete upload/download
- emit concise, useful errors
- when a mandatory runtime dependency is missing, name it and print the exact
  install command the user should run
- avoid dumping full raw payloads unless the command is explicitly a raw or
  debug-style escape hatch
- require an explicit output flag for file-producing commands
- avoid interactive prompts outside explicit auth/bootstrap commands

## Documentation Deliverables

Generate concise docs with the tool:

- root `README.md` with a short overview
- install or run notes in `README.md`
- library quick-start notes when the package exposes a client library
- command list grouped by noun or workflow
- auth/bootstrap notes
- output contract notes
- limitation notes when relevant
- publishing notes in `README.md`, not a separate `PUBLISHING.md`

The docs should read as finished product documentation, not scaffolding notes.
Prefer short sections, concrete examples, and direct wording. Do not leave
template prose such as "Replace this file" in the final generated package.

If the tool depends on a non-bundled runtime dependency, document the install
step in `README.md`, but do not rely on docs alone. The command should still
detect the missing dependency and explain how to install it.

When the tool uses browser-auth session reuse, make the required session path
explicit in the docs and examples:

- show `login --session-path <path>`
- show the same `--session-path <path>` on later authenticated commands
- do not imply a hidden default session location for this pattern

When commands compose through identifiers or machine-readable output, document
that explicitly:

- show which command emits the identifier
- show which later commands accept it
- show representative `--json` output shapes when useful
- show the success and error shape when the CLI wraps provider responses

Also generate a compact root `COMMANDS.md` as a CLI cheat sheet suitable to
pass to another agent. Keep it short, operational, and optimized for fast
scanning.

If the package exposes both a client library and a CLI, keep this compact
commands document focused on the CLI and put library usage in the overview or
publishing notes in `README.md`.

That cheat sheet should:

- prefer copy-pasteable commands over paragraphs
- group commands by setup, auth, and main workflows when that improves scanning
- start with `doctor` and auth/bootstrap commands when they exist
- show the main noun-then-verb commands for the common workflow
- prefer `--json` in examples meant for agent use
- call out non-destructive defaults and any dangerous write commands
- show how to invoke the CLI locally and, for JSR-ready tools, how to invoke it
  as `deno x jsr:@scope/package/cli`
- show the stable IDs or output fields a command emits when later commands
  consume them
- keep each command entry to the command plus a short note only when needed
