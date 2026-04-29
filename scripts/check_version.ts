import { fromFileUrl } from "@std/path/from-file-url";
import denoConfig from "../deno.json" with { type: "json" };

const expectedVersion = denoConfig.version;
const cliPath = fromFileUrl(new URL("../cli.ts", import.meta.url));

const command = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", cliPath, "--version"],
  stdout: "piped",
  stderr: "piped",
});

const output = await command.output();
const stdout = new TextDecoder().decode(output.stdout).trim();
const stderr = new TextDecoder().decode(output.stderr).trim();

if (!output.success) {
  console.error(stderr || `Failed to run CLI version check.`);
  Deno.exit(output.code);
}

if (stdout !== expectedVersion) {
  console.error(
    `CLI version mismatch: deno.json has ${expectedVersion}, but cli.ts reports ${stdout}.`,
  );
  Deno.exit(1);
}

console.log(`CLI version matches deno.json: ${expectedVersion}`);
