# JSR Publishing

Use this when generating a Deno package that should expose a client library at
the package root and a CLI from `./cli`.

## Default Rules

- put JSR package metadata in `deno.json`
- include `name`, `version`, and `exports`
- include a `license` field or publish a `LICENSE` file
- keep the default `.` export for the library root, usually `./mod.ts`
- export the CLI from `./cli`, usually `./cli.ts`
- use `import.meta.main` in the CLI entrypoint
- keep the client library runtime-neutral where practical and keep Deno-specific
  I/O, auth persistence, and argv handling in the CLI layer
- keep all imports ESM and use explicit relative file extensions such as
  `./mod.ts`

`mod.ts` is still the conventional Deno library root. Keep it thin by
re-exporting the public library surface directly from files under `lib/`.

## Recommended `deno.json`

Use an object form for `exports` when you want a library root plus a runnable
CLI entrypoint.

```json
{
  "name": "@your-scope/your-tool",
  "version": "0.1.0",
  "exports": {
    ".": "./mod.ts",
    "./cli": "./cli.ts"
  }
}
```

With this pattern:

- `import { createClient } from "jsr:@your-scope/your-tool"` imports the library
  surface
- `deno x jsr:@your-scope/your-tool/cli` runs the CLI
- `deno install -g -A jsr:@your-scope/your-tool/cli` installs the CLI globally

## Validation

Before calling the package publish-ready:

1. run `deno check` on the published entrypoints
2. run `deno publish --dry-run`
3. fix any publish-time errors before finishing

## Publishing Notes

- users must create the scope and package on JSR before first publish
- local publishing uses `deno publish`
- GitHub Actions can publish with OIDC after the repository is linked in JSR
  settings
