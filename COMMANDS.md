# Commands

CLI forms:

```bash
deno run -A ./cli.ts --help
./bin/meta-ai --help
deno x jsr:@cliat/meta-ai/cli --help
meta-ai --help
```

On Windows, the compiled binary path is `.\bin\meta-ai.exe`.

Start with:

```bash
npm install -g @playwright/cli@latest
playwright-cli install-browser --browser=chrome
meta-ai login --session-path ./.auth/meta-session.json
```

For common media work:

```bash
meta-ai --json image create --session-path ./.auth/meta-session.json --prompt "a fox in snowfall" --image-out out/fox --aspect 1:1
meta-ai --json video create --session-path ./.auth/meta-session.json --prompt "a paper airplane gliding through clouds" --video-out out/plane --aspect 16:9
meta-ai --json history download --session-path ./.auth/meta-session.json --out out/history
meta-ai --json history download --session-path ./.auth/meta-session.json --out out/history --delete
meta-ai --json history clear --session-path ./.auth/meta-session.json --force
```

Rules:

- prefer `meta-ai` on PATH or `./bin/meta-ai` after `deno task build`; otherwise
  use `deno run -A ./cli.ts`
- install `playwright-cli` and its browser once before using `login`
- use `login --session-path <path>` first, then reuse the same path on all later
  authenticated commands
- prefer `--json` when another agent or script will parse output
- `image create` maps the main Meta UI controls to `--prompt`, `--aspect`,
  `--count`, `--animate`, `--video-out`, and `--extend`
- `history download` requires an explicit output directory
- `history download --delete` removes only the prompts tied to files written by
  that invocation
- `history clear --force` is destructive and removes prompts from Meta history
- file-producing commands require explicit output paths
