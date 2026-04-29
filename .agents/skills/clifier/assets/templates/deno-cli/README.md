# Your Tool

Replace this file with a concise, polished overview of the generated package.

Cover the essentials:

- what the tool automates
- how to run the CLI locally
- how to import and use the client library
- auth/bootstrap requirements
- required runtime dependencies and how to install them
- main command groups
- output and JSON behavior, including whether `--json` is a CLI envelope or
  pass-through
- limits or caveats that matter in practice
- publishing notes when the package is intended for JSR

Keep the README short, concrete, and user-facing. Avoid internal scaffolding
notes or long narrative explanations.

Typical local workflow:

```bash
deno task check
deno task run --help
```

If you want a local standalone binary, compile it into `bin/`:

```bash
deno task compile
```

The package root should stay importable as the client library:

```ts
import { createClient } from "jsr:@your-scope/your-tool";
```

If the package is published to JSR, users can run the CLI without cloning the
repo:

```bash
deno x jsr:@your-scope/your-tool/cli
```

Global install also works:

```bash
deno install -g -A jsr:@your-scope/your-tool/cli
```

Before publishing:

```bash
deno task check
deno task publish:dry-run
```

Publish locally:

```bash
deno task publish
```

The included GitHub Actions workflow uses OIDC publishing. Before it works,
create the package on JSR and link the GitHub repository in the package
settings.
