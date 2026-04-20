# meta-ai

`@cliat/meta-ai` is a Deno package that exposes a reusable Meta AI client
library and a thin CLI for authenticated image, animation, video, and history
workflows. The installed CLI command is `meta-ai`.

- `login` uses `playwright-cli` with a headed browser to capture storage state
- later operational commands reuse the same explicit `--session-path`
- create, poll, download, and history work run through `fetch` in the client
  library

## Run and publish

Run locally:

```bash
deno run -A ./cli.ts --help
deno task check
deno task build
```

The compile task writes the standalone binary to `./bin/meta-ai` on Unix-like
systems and `.\bin\meta-ai.exe` on Windows.

Publish to JSR:

```bash
deno publish --dry-run
deno publish
```

Run the published CLI directly:

```bash
deno x jsr:@cliat/meta-ai/cli --help
```

Install the CLI onto PATH with the intended command name:

```bash
deno install -g -A --name meta-ai jsr:@cliat/meta-ai/cli
meta-ai --help
```

Run the compiled local binary:

```bash
./bin/meta-ai --help
```

On Windows, run `.\bin\meta-ai.exe --help`.

## Library quick start

```ts
import { MetaAiClient } from "jsr:@cliat/meta-ai";

const client = new MetaAiClient(storageState);
const result = await client.createImage("a fox in snowfall", "1:1", 1);
```

The package root stays library-first. `./cli` is the Deno CLI export.

## Browser dependency

`login` requires `playwright-cli` on PATH.

```bash
npm install -g @playwright/cli@latest
playwright-cli install-browser --browser=chrome
```

If the browser dependency is missing, `login` reports the exact install command
to run.

## Auth and bootstrap

This tool uses explicit browser-auth session reuse. There is no implicit
default session path.

Keep saved session files under `./.auth/` or another user-local path, and do
not commit or publish them. Generated media under `out/` and `history/` is also
intended to stay local.

```bash
deno run -A ./cli.ts login --session-path ./.auth/meta-session.json
meta-ai login --session-path ./.auth/meta-session.json
deno x jsr:@cliat/meta-ai/cli login --session-path ./.auth/meta-session.json
```

Use the same `--session-path` on every later authenticated command.

## UI to CLI mapping

- Prompt box -> `image create --prompt ...` or `video create --prompt ...`
- Aspect selector -> `--aspect 9:16|1:1|16:9`
- Image count selector -> `image create --count <n>`
- Animate button/prompt -> `image create --animate [text] --video-out <path>`
- Extend action -> `--extend <n>`

## Common workflow

Generate and download an image:

```bash
meta-ai image create \
  --session-path ./.auth/meta-session.json \
  --prompt "a cinematic close-up of a fox in snowfall" \
  --image-out out/fox \
  --aspect 1:1
```

Generate two images, animate both, extend both twice, and download all files:

```bash
meta-ai image create \
  --session-path ./.auth/meta-session.json \
  --prompt "a neon koi fish in a dark pond" \
  --image-out out/koi \
  --count 2 \
  --aspect 9:16 \
  --animate "slow water ripple and gentle camera drift" \
  --video-out out/koi \
  --extend 2
```

Generate videos directly, extend every returned variation once, and download
all of them:

```bash
meta-ai video create \
  --session-path ./.auth/meta-session.json \
  --prompt "a paper airplane gliding through clouds" \
  --video-out out/plane \
  --aspect 16:9 \
  --extend 1
```

Download all generated history media into a directory:

```bash
meta-ai history download \
  --session-path ./.auth/meta-session.json \
  --out out/history
```

Download saved history media and then remove only the prompts whose files were
written by that invocation:

```bash
meta-ai history download \
  --session-path ./.auth/meta-session.json \
  --out out/history \
  --delete
```

Remove generated prompts from Meta history without downloading:

```bash
meta-ai history clear \
  --session-path ./.auth/meta-session.json \
  --force
```

## Output contract

- human-readable output is the default
- every command supports `--json`
- `--json` writes machine-readable output to stdout only
- errors and progress messages go to stderr
- file-producing commands require explicit output flags
- `image create` returns a stable `conversationId` alongside downloaded files
- `history download` writes every discovered generated file under the requested
  output directory
- `history download --delete` removes only the prompts tied to files saved by
  that command run
- `history clear` is destructive and requires `--force`

## Notes and limitations

- `image create` defaults to `--count 1`
- `image create` defaults to `--aspect 9:16`
- `video create` requires `--aspect`
- `video create` currently returns 4 variants from this Meta flow
- `--extend` applies to every animated or generated video
- output paths are treated as base names and become numbered files
- `history download` paginates Meta's `mediaLibraryFeed` GraphQL connection and
  resolves prompt UUIDs from `create/<mediaId>` pages when the feed omits them
- `history clear` uses the same recovered prompt ids plus Meta's delete
  mutation, with a short pause between deletes

See [COMMANDS.md](./COMMANDS.md) for the compact command reference.
