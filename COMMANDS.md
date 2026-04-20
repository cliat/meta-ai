# Commands

Quick syntax reference for `meta-ai`. See [README.md](./README.md) for the full
CLI guide and behavior details.

## Invocation forms

```bash
meta-ai --help # show help for the installed CLI on PATH
deno x jsr:@cliat/meta-ai/cli --help # run the CLI from JSR and display its help
deno run -A ./cli.ts --help # run the local source entrypoint and display its help
./bin/meta-ai --help # run the compiled local binary and display its help
```

On Windows, the compiled binary path is `.\bin\meta-ai.exe`.

## Install and login dependencies

```bash
deno install -g -A --name meta-ai jsr:@cliat/meta-ai/cli # install the CLI globally onto PATH
npm install -g @playwright/cli@latest # install the Playwright CLI required for browser-based login
playwright-cli install-browser --browser=chrome # install the Chrome browser that `meta-ai login` launches
```

## Syntax

```bash
meta-ai login -s <path> [-u <url>] [--json] # open a browser, authenticate to Meta, and save a reusable session file
meta-ai image create -p <text> -i <path> -s <path> [-v <path>] [-a [text]] [-r <ratio>] [--count <n>] [--extend <n>] [--json] # generate images and optionally animate and extend them
meta-ai video create -p <text> -v <path> -r <ratio> -s <path> [--extend <n>] [--json] # generate videos and optionally extend each returned variant
meta-ai history download -o <dir> -s <path> [--delete] [--json] # download generated history media and optionally remove the related prompts
meta-ai history clear -s <path> --force [--json] # delete generated prompts from Meta history without downloading files
```

## Short aliases

```bash
-s  --session-path # login, image create, video create, history download, history clear
-u  --url # login
-p  --prompt # image create, video create
-i  --image-out # image create
-v  --video-out # image create, video create
-a  --animate # image create
-r  --aspect # image create, video create
-o  --out # history download
```

## Examples

```bash
meta-ai login --session-path ./.auth/meta-session.json # save a reusable Meta session under ./.auth
meta-ai --json image create --session-path ./.auth/meta-session.json --prompt "a fox in snowfall" --image-out out/fox --aspect 1:1 # create one image and emit machine-readable output
meta-ai --json video create --session-path ./.auth/meta-session.json --prompt "a paper airplane gliding through clouds" --video-out out/plane --aspect 16:9 # generate videos directly and save them under out/plane*
meta-ai --json history download --session-path ./.auth/meta-session.json --out out/history # download generated history media into out/history
meta-ai --json history download --session-path ./.auth/meta-session.json --out out/history --delete # download generated history media and delete only the prompts tied to saved files
meta-ai --json history clear --session-path ./.auth/meta-session.json --force # remove generated prompts from Meta history without downloading them
```

## Reminders

- run `login` first, then reuse the same `--session-path` on every later command
- install `playwright-cli` and its browser before using `login`
- `--json` is available on every command
- `image create` defaults to `--aspect 9:16` and `--count 1`
- `image create --video-out` requires `--animate`
- `image create --extend` requires `--animate`
- `video create` requires `--aspect`
- `history download --delete` removes only prompts tied to files saved by that
  invocation
- `history clear` is destructive and requires `--force`
- output paths are base names; numbered files are created automatically
