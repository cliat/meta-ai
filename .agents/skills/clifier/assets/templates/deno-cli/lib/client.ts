export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ClientOptions = {
  baseUrl?: string | URL;
  headers?: HeadersInit;
  fetch?: FetchLike;
};

export type HealthStatus = {
  ok: true;
  baseUrl: string;
  message: string;
};

export const DEFAULT_BASE_URL = "https://example.com/";

function resolveBaseUrl(baseUrl?: string | URL): URL {
  if (baseUrl instanceof URL) {
    return baseUrl;
  }

  return new URL(baseUrl ?? DEFAULT_BASE_URL);
}

function mergeHeaders(
  base: HeadersInit | undefined,
  extra: HeadersInit | undefined,
): Headers {
  const headers = new Headers(base);

  if (!extra) {
    return headers;
  }

  for (const [name, value] of new Headers(extra).entries()) {
    headers.set(name, value);
  }

  return headers;
}

export class Client {
  readonly #baseUrl: URL;
  readonly #fetch: FetchLike;
  readonly #headers: Headers;

  constructor(options: ClientOptions = {}) {
    this.#baseUrl = resolveBaseUrl(options.baseUrl);
    this.#fetch = options.fetch ?? fetch;
    this.#headers = new Headers(options.headers);
  }

  get baseUrl(): string {
    return this.#baseUrl.toString();
  }

  async checkHealth(): Promise<HealthStatus> {
    return {
      ok: true,
      baseUrl: this.baseUrl,
      message: "Replace with a real health check or capability probe.",
    };
  }

  async request(path: string | URL, init: RequestInit = {}): Promise<Response> {
    return await this.#fetch(this.resolveUrl(path), {
      ...init,
      headers: mergeHeaders(this.#headers, init.headers),
    });
  }

  async requestJson<T>(
    path: string | URL,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.request(path, init);
    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json() as T;
  }

  resolveUrl(path: string | URL): URL {
    if (path instanceof URL) {
      return path;
    }

    return new URL(path, this.#baseUrl);
  }
}

export function createClient(options: ClientOptions = {}): Client {
  return new Client(options);
}
