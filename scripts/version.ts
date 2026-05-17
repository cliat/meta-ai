import denoConfig from "../deno.json" with { type: "json" };

const version = denoConfig.version;
const [mode = "current", ...restArgs] = Deno.args;
const [refArg] = stripTaskDelimiter(restArgs);

await run();

async function run(): Promise<void> {
  switch (mode) {
    case "current":
      console.log(version);
      return;
    case "compare":
      await compareVersion(refArg, false);
      return;
    case "github-output":
      await compareVersion(refArg, true);
      return;
    default:
      throw new Error(
        `Unknown mode "${mode}". Use "current", "compare", or "github-output".`,
      );
  }
}

async function compareVersion(
  refArg: string | undefined,
  writeGithubOutput: boolean,
): Promise<void> {
  const ref = normalizeRef(refArg);
  const previousVersion = ref ? await readVersionFromRef(ref) : null;
  const changed = previousVersion === null || previousVersion !== version;
  const payload = {
    changed,
    currentVersion: version,
    previousVersion,
    ref,
    tag: `v${version}`,
  };

  if (writeGithubOutput) {
    const outputPath = Deno.env.get("GITHUB_OUTPUT");
    if (!outputPath) {
      throw new Error("GITHUB_OUTPUT is not set.");
    }

    const lines = [
      `changed=${String(payload.changed)}`,
      `current_version=${payload.currentVersion}`,
      `previous_version=${payload.previousVersion ?? ""}`,
      `ref=${payload.ref ?? ""}`,
      `tag=${payload.tag}`,
    ];
    await Deno.writeTextFile(outputPath, `${lines.join("\n")}\n`, {
      append: true,
    });
  }

  console.log(JSON.stringify(payload, null, 2));
}

function normalizeRef(refArg: string | undefined): string | null {
  if (!refArg || refArg === "-" || refArg === "0000000000000000000000000000000000000000") {
    return null;
  }

  return refArg;
}

function stripTaskDelimiter(args: string[]): string[] {
  return args[0] === "--" ? args.slice(1) : args;
}

async function readVersionFromRef(ref: string): Promise<string | null> {
  const command = new Deno.Command("git", {
    args: ["show", `${ref}:deno.json`],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  if (!output.success) {
    return null;
  }

  const raw = new TextDecoder().decode(output.stdout);
  const parsed = JSON.parse(raw) as { version?: unknown };
  return typeof parsed.version === "string" ? parsed.version : null;
}
