/**
 * Public library root for this package.
 *
 * Keep the package root for the client library. Publish the CLI separately from
 * `./cli` so users can import `jsr:@scope/package` and run
 * `deno x jsr:@scope/package/cli`.
 *
 * @module
 */

export { Client, createClient, DEFAULT_BASE_URL } from "./lib/client.ts";
export type { ClientOptions, FetchLike, HealthStatus } from "./lib/client.ts";
