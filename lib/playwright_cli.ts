const DEFAULT_BROWSER = "chrome";
const PLAYWRIGHT_CLI_INSTALL_COMMAND = "npm install -g @playwright/cli@latest";
const PLAYWRIGHT_CLI_BROWSER_INSTALL_COMMAND =
  `playwright-cli install-browser --browser=${DEFAULT_BROWSER}`;

export type PlaywrightCliDependencyChecks = {
  playwrightCliAvailable: boolean;
  playwrightCliBrowserReady: boolean;
  executable: string | null;
  installCommands: string[];
  message: string;
};

type RunPlaywrightCliOptions = {
  allowFailure?: boolean;
};

type PlaywrightCliOpenOptions = {
  url?: string;
  browser?: string;
  headed?: boolean;
  persistent?: boolean;
};

export function generatePlaywrightCliSessionName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function checkPlaywrightCliDependencies(): Promise<
  PlaywrightCliDependencyChecks
> {
  const executable = resolvePlaywrightCliExecutable();

  try {
    await runPlaywrightCli(["--version"]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      playwrightCliAvailable: false,
      playwrightCliBrowserReady: false,
      executable: null,
      installCommands: [
        PLAYWRIGHT_CLI_INSTALL_COMMAND,
        PLAYWRIGHT_CLI_BROWSER_INSTALL_COMMAND,
      ],
      message: [
        "playwright-cli is not available on PATH.",
        `Install it with \`${PLAYWRIGHT_CLI_INSTALL_COMMAND}\`, then install a browser with \`${PLAYWRIGHT_CLI_BROWSER_INSTALL_COMMAND}\`.`,
        detail,
      ].join(" "),
    };
  }

  const sessionName = generatePlaywrightCliSessionName("meta.ai-check");
  try {
    await openPlaywrightCliSession(sessionName, { url: "about:blank" });
    return {
      playwrightCliAvailable: true,
      playwrightCliBrowserReady: true,
      executable,
      installCommands: [],
      message: `playwright-cli is available via ${executable}.`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      playwrightCliAvailable: true,
      playwrightCliBrowserReady: false,
      executable,
      installCommands: [PLAYWRIGHT_CLI_BROWSER_INSTALL_COMMAND],
      message: [
        "playwright-cli is installed but could not launch its configured browser.",
        `Run \`${PLAYWRIGHT_CLI_BROWSER_INSTALL_COMMAND}\` and then retry.`,
        detail,
      ].join(" "),
    };
  } finally {
    await closePlaywrightCliSession(sessionName).catch(() => undefined);
  }
}

export async function openPlaywrightCliSession(
  sessionName: string,
  options: PlaywrightCliOpenOptions = {},
): Promise<void> {
  const args = [withSessionArg(sessionName), "open"];
  if (options.url) {
    args.push(options.url);
  }
  args.push(`--browser=${options.browser ?? DEFAULT_BROWSER}`);
  if (options.headed) {
    args.push("--headed");
  }
  if (options.persistent) {
    args.push("--persistent");
  }
  await runPlaywrightCli(args);
}

export async function closePlaywrightCliSession(
  sessionName: string,
): Promise<void> {
  await runPlaywrightCli([withSessionArg(sessionName), "close"], {
    allowFailure: true,
  });
}

export async function loadPlaywrightCliState(
  sessionName: string,
  sessionPath: string,
): Promise<void> {
  await runPlaywrightCli([
    withSessionArg(sessionName),
    "state-load",
    sessionPath,
  ]);
}

export async function savePlaywrightCliState(
  sessionName: string,
  sessionPath: string,
): Promise<void> {
  await runPlaywrightCli([
    withSessionArg(sessionName),
    "state-save",
    sessionPath,
  ]);
}

export async function runPlaywrightCliCodeJson<T>(
  sessionName: string,
  code: string,
): Promise<T> {
  const result = await runPlaywrightCli([
    withSessionArg(sessionName),
    "run-code",
    code,
  ]);
  return parsePlaywrightCliJsonResult<T>(result.stdout);
}

function withSessionArg(sessionName: string): string {
  return `-s=${sessionName}`;
}

function resolvePlaywrightCliExecutable(): string {
  return Deno.build.os === "windows" ? "playwright-cli.cmd" : "playwright-cli";
}

async function runPlaywrightCli(
  args: string[],
  options: RunPlaywrightCliOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  const command = new Deno.Command(resolvePlaywrightCliExecutable(), {
    args,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  });

  let output: Deno.CommandOutput;
  try {
    output = await command.output();
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(
        `Could not execute ${resolvePlaywrightCliExecutable()}. Is playwright-cli installed and on PATH?`,
      );
    }
    throw error;
  }

  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);
  if (!output.success && !options.allowFailure) {
    const detail = [stderr.trim(), stdout.trim()].filter(Boolean).join(" ");
    throw new Error(
      `playwright-cli ${args.join(" ")} failed with code ${output.code}.${detail ? ` ${detail}` : ""}`,
    );
  }

  return { stdout, stderr };
}

function parsePlaywrightCliJsonResult<T>(stdout: string): T {
  const match = stdout.match(
    /### Result\s*[\r\n]+([\s\S]*?)(?:[\r\n]+### [^\r\n]+|$)/,
  );
  if (!match) {
    throw new Error("playwright-cli did not return a parsable result block.");
  }

  const raw = match[1].trim();
  if (!raw) {
    throw new Error("playwright-cli returned an empty result block.");
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(
      `playwright-cli returned a non-JSON result block: ${raw}. ${String(error)}`,
    );
  }
}
