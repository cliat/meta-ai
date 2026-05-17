import denoJson from "../deno.json" with { type: "json" };

const ZERO_SHA = "0000000000000000000000000000000000000000";

type VersionResult = {
  baseRef?: string;
  changed: boolean;
  current: string;
  previous?: string;
  tag: string;
};

function currentVersion(): string {
  const version = denoJson.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("deno.json must include a non-empty version string.");
  }
  return version;
}

function isMissingBaseRef(baseRef?: string): boolean {
  return !baseRef || baseRef === ZERO_SHA;
}

async function manifestAtRef(
  baseRef: string,
): Promise<Record<string, unknown> | undefined> {
  const output = await new Deno.Command("git", {
    args: ["show", `${baseRef}:deno.json`],
    stderr: "null",
    stdout: "piped",
  }).output();

  if (!output.success) return undefined;

  return JSON.parse(new TextDecoder().decode(output.stdout)) as Record<
    string,
    unknown
  >;
}

function manifestVersion(manifest: Record<string, unknown>): string {
  const version = manifest.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("The referenced deno.json did not include a version.");
  }
  return version;
}

async function compareVersion(baseRef?: string): Promise<VersionResult> {
  const current = currentVersion();
  if (isMissingBaseRef(baseRef)) {
    return { baseRef, changed: true, current, tag: `v${current}` };
  }

  const resolvedBaseRef = baseRef!;
  const manifest = await manifestAtRef(resolvedBaseRef);
  if (!manifest) {
    return {
      baseRef: resolvedBaseRef,
      changed: true,
      current,
      tag: `v${current}`,
    };
  }

  const previous = manifestVersion(manifest);
  return {
    baseRef: resolvedBaseRef,
    changed: previous !== current,
    current,
    previous,
    tag: `v${current}`,
  };
}

async function writeGithubOutput(baseRef?: string): Promise<void> {
  const outputPath = Deno.env.get("GITHUB_OUTPUT");
  if (!outputPath) {
    throw new Error("GITHUB_OUTPUT is not set.");
  }

  const result = await compareVersion(baseRef);
  const lines = [
    `current=${result.current}`,
    `previous=${result.previous ?? ""}`,
    `changed=${result.changed}`,
    `tag=${result.tag}`,
  ];
  await Deno.writeTextFile(outputPath, `${lines.join("\n")}\n`, {
    append: true,
  });
}

async function runVersionTask(args: string[]): Promise<void> {
  const [command = "current", rawBaseRef] = args;
  const baseRef = rawBaseRef === "--" ? args[2] : rawBaseRef;

  if (command === "current") {
    console.log(JSON.stringify({
      changed: false,
      current: currentVersion(),
      tag: `v${currentVersion()}`,
    }, null, 2));
    return;
  }

  if (command === "compare") {
    console.log(JSON.stringify(await compareVersion(baseRef), null, 2));
    return;
  }

  if (command === "github-output") {
    await writeGithubOutput(baseRef);
    return;
  }

  throw new Error(
    `Unknown version helper command "${command}". Use current, compare, or github-output.`,
  );
}

if (import.meta.main) {
  await runVersionTask(Deno.args);
}
