# Clifier

`clifier` is an agent skill for turning a repeatable website workflow into a
small, publishable Deno CLI package.

It guides the agent to define the CLI first, investigate the target site,
prefer `fetch` where possible, and generate a reusable CLI plus client library
from the bundled Deno template.

Start with [`SKILL.md`](./SKILL.md). The rest of this folder contains focused
references and template assets.

## Quick install

```bash
npx skills add popra/skills@clifier
```

## Example prompt

```
$clifier build a CLI for posting threads and images to x.com with login, drafts, and scheduled posts
```