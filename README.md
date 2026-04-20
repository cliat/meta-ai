# meta-ai

`meta-ai` is a CLI and Deno package for authenticated Meta AI image, video,
and history workflows. Log in once with a real browser, save the resulting
session file, and then reuse that session for image generation, animation,
video generation, history download, and history cleanup.

- CLI command: `meta-ai`
- JSR package: `@cliat/meta-ai`
- Auth model: explicit browser login captured to a storage-state file

See [COMMANDS.md](./COMMANDS.md) for the short cheat sheet. This README is the
full CLI guide.

## Install

Choose one way to run the CLI:

Run directly from JSR:

```bash
deno x jsr:@cliat/meta-ai/cli --help
```

Install onto PATH:

```bash
deno install -g -A --name meta-ai jsr:@cliat/meta-ai/cli
meta-ai --help
```

Run from this repo:

```bash
deno run -A ./cli.ts --help
```

or build a binary:

```bash
deno task build
./bin/meta-ai --help
```

On Windows, run `.\bin\meta-ai.exe --help`.

### Dependencies for `login`

`login` opens a headed browser through `playwright-cli`. Install it once and
install a browser before your first login:

```bash
npm install -g @playwright/cli@latest
playwright-cli install-browser --browser=chrome
```

`login` is the only command that launches Playwright directly, but every later
authenticated command still depends on a valid session file produced by
`login`.

## UI to CLI mapping

- Prompt box -> `image create --prompt ...` or `video create --prompt ...`
- Aspect selector -> `--aspect 9:16|1:1|16:9`
- Image count selector -> `image create --count <n>`
- Animate button or prompt -> `image create --animate [text] --video-out <path>`
- Extend action -> `--extend <n>`

## Login and session bootstrap

This CLI uses explicit browser-auth session reuse. There is no implicit default
session path, so choose a path you will reuse later:

```bash
meta-ai login --session-path ./.auth/meta-session.json
```

Important behavior:

- `--session-path <path>` is required
- `--url <url>` is optional and defaults to `https://meta.ai/create`
- `login` opens a real browser and waits until a Meta session cookie is present
- the saved file is Playwright storage-state JSON
- reuse the same `--session-path` on every later authenticated command
- keep session files under `./.auth/` or another local path and never commit
  them

## CLI feature guide

Every command supports the global `--json` flag.

### `login`

Open a browser and write a reusable Meta session to disk.

Required flags:

- `--session-path <path>`

Optional flags:

- `--url <url>`

Example:

```bash
meta-ai --json login --session-path ./.auth/meta-session.json
```

### `image create`

Generate images and optionally animate and extend them.

Required flags:

- `--prompt <text>`
- `--image-out <path>`
- `--session-path <path>`

Optional flags:

- `--video-out <path>`
- `--animate [text]`
- `--aspect <ratio>` defaults to `9:16`
- `--count <n>` defaults to `1`
- `--extend <n>` defaults to `0`

Important behavior:

- `--video-out` requires `--animate`
- `--extend` requires `--animate`
- if `--animate` is present without text, the default animation prompt is
  `Animate`
- image output paths are treated as base names and become numbered `.jpg` files
- animated video output paths are treated as base names and become numbered
  `.mp4` files
- the command returns a stable `conversationId` alongside downloaded files

Create one image:

```bash
meta-ai image create \
  --session-path ./.auth/meta-session.json \
  --prompt "a cinematic close-up of a fox in snowfall" \
  --image-out out/fox \
  --aspect 1:1
```

Create two images, animate both, extend both twice, and download all files:

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

### `video create`

Generate videos directly and optionally extend them.

Required flags:

- `--prompt <text>`
- `--video-out <path>`
- `--aspect <ratio>`
- `--session-path <path>`

Optional flags:

- `--extend <n>` defaults to `0`

Important behavior:

- `--aspect` is required here; there is no default
- output paths are treated as base names and become numbered `.mp4` files
- `--extend` applies to every returned video
- this Meta flow currently returns 4 video variants

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

### `history download`

Download generated media from your Meta create and vibes history.

Required flags:

- `--out <path>`
- `--session-path <path>`

Optional flags:

- `--delete`

Important behavior:

- `--out` must point to a directory
- the command writes every discovered generated file under that directory
- `--delete` removes only the prompts tied to files written by that invocation
- when the feed omits prompt ids, the command resolves them from `create/<mediaId>`
  pages before deleting

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

### `history clear`

Remove generated prompts from Meta history without downloading files.

Required flags:

- `--session-path <path>`
- `--force`

Important behavior:

- this command is destructive
- `--force` is required
- the command removes generated prompts from Meta history using the same prompt
  id recovery strategy as `history download`

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
- `login` reports the saved session path and cookie count
- `image create` reports the `conversationId`, downloaded images, and any
  downloaded animation results
- `video create` reports the `conversationId` and downloaded videos
- `history download` reports downloaded files and any prompt ids deleted by
  `--delete`
- `history clear` reports the removed prompt ids

## Notes and limitations

- `image create` defaults to `--count 1`
- `image create` defaults to `--aspect 9:16`
- `video create` requires `--aspect`
- `--extend` applies to every animated or generated video
- output paths are treated as base names and become numbered files
- `history download` paginates Meta's `mediaLibraryFeed` GraphQL connection
- `history clear` uses Meta's delete mutation with a short pause between deletes
- generated media under `out/` and `history/` is intended to stay local

## Library usage

The package root stays library-first. The `./cli` export is the Deno CLI entry.
You can load the same storage-state JSON that `meta-ai login` writes.

```ts
import { MetaAiClient, type StorageState } from "jsr:@cliat/meta-ai";

const storageState = JSON.parse(
  await Deno.readTextFile("./.auth/meta-session.json"),
) as StorageState;
const client = new MetaAiClient(storageState);
const result = await client.createImage("a fox in snowfall", "1:1", 1);
```

## Development and publishing

Run locally:

```bash
deno task check
deno task build
```

Publish to JSR:

```bash
deno publish --dry-run
deno publish
```
