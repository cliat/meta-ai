# Commands

Quick syntax reference for `meta-ai`. See [README.md](./README.md) for the full
CLI guide and behavior details.

## Invocation forms

```bash
meta-ai --help # show help for the installed CLI on PATH
deno x jsr:@cliat/meta-ai/cli --help # run the CLI from JSR and display its help
deno run -A ./cli.ts --help # run the local source entrypoint and display its help
./bin/meta-ai-x86_64-unknown-linux-gnu --help # run a compiled local binary and display its help
```

On Windows, the compiled binary path is
`.\bin\meta-ai-x86_64-pc-windows-msvc.exe`.

## Install and login dependencies

```bash
deno install -g -A --name meta-ai jsr:@cliat/meta-ai/cli # install the CLI globally onto PATH
npm install -g @playwright/cli@latest # install the Playwright CLI required for browser-based login
playwright-cli install-browser --browser=chrome # install the Chrome browser that `meta-ai auth login` launches
```

## Syntax

```bash
meta-ai [--json] [-s <path>] auth login [-u <url>] # open a browser, authenticate to Meta, and save a reusable session file
meta-ai [--json] [-s <path>] image create -p <text> -i <path> [-v <path>] [-a [text]] [-r <ratio>] [--count <n>] [--extend <n>] # generate images and optionally animate and extend them
meta-ai [--json] [-s <path>] video create -p <text> -v <path> -r <ratio> [--extend <n>] # generate videos and optionally extend each returned variant
meta-ai [--json] [-s <path>] history download -o <dir> [--delete] # download generated history media and optionally remove the related prompts
meta-ai [--json] [-s <path>] history clear --force # delete generated prompts from Meta history without downloading files
```

## Short aliases

```bash
-s  --session-path # global auth/session override; defaults to ~/.auth/cliat@meta-ai.json
-u  --url # auth login
-p  --prompt # image create, video create
-i  --image-out # image create
-v  --video-out # image create, video create
-a  --animate # image create
-r  --aspect # image create, video create
-o  --out # history download
```

## Examples

```bash
meta-ai auth login # save a reusable Meta session at ~/.auth/cliat@meta-ai.json
meta-ai --json --session-path ~/.auth/cliat@meta-ai.json image create --prompt "a fox in snowfall" --image-out out/fox --aspect 1:1 # create one image and emit machine-readable output
meta-ai --json --session-path ~/.auth/cliat@meta-ai.json video create --prompt "a paper airplane gliding through clouds" --video-out out/plane --aspect 16:9 # generate videos directly and save them under out/plane*
meta-ai --json --session-path ~/.auth/cliat@meta-ai.json history download --out out/history # download generated history media into out/history
meta-ai --json --session-path ~/.auth/cliat@meta-ai.json history download --out out/history --delete # download generated history media and delete only the prompts tied to saved files
meta-ai --json --session-path ~/.auth/cliat@meta-ai.json history clear --force # remove generated prompts from Meta history without downloading them
```

## Reminders

- run `auth login` first, then reuse the same `--session-path` on every later command or rely on the default path
- install `playwright-cli` and its browser before using `auth login`
- `--json` is available on every command
- put global flags before the command path in docs and scripts
- `image create` defaults to `--aspect 9:16` and `--count 1`
- `--aspect` works by appending `aspect <ratio>` to the submitted prompt
- `image create --video-out` requires `--animate`
- `image create --extend` requires `--animate`
- `video create` requires `--aspect`
- `history download --delete` removes only prompts tied to files saved by that
  invocation
- `history clear` is destructive and requires `--force`
- output paths are base names; numbered files are created automatically
