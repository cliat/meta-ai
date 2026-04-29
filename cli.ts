import { Command } from "@cliffy/command";
import denoConfig from "./deno.json" with { type: "json" };
import { downloadFile } from "./lib/download.ts";
import {
  clearHistoryContent,
  collectHistoryInventory,
  downloadHistoryInventory,
} from "./lib/history.ts";
import {
  type AspectRatio,
  type CompletedVideo,
  type GeneratedImage,
  type GeneratedVideo,
  MetaAiClient,
} from "./lib/meta_api.ts";
import { formatOutput } from "./lib/output.ts";
import { planNumberedOutputs, resolvePath } from "./lib/paths.ts";
import {
  checkPlaywrightCliDependencies,
  closePlaywrightCliSession,
  generatePlaywrightCliSessionName,
  openPlaywrightCliSession,
  savePlaywrightCliState,
} from "./lib/playwright_cli.ts";
import {
  hasMetaSessionCookie,
  loadStorageState,
  saveStorageState,
  type StorageState,
} from "./lib/session.ts";

type SharedOptions = {
  json?: boolean;
};

type AuthenticatedOptions = SharedOptions & {
  sessionPath: string;
};

type LoginOptions = SharedOptions & {
  sessionPath: string;
  url?: string;
};

type ImageCreateOptions = AuthenticatedOptions & {
  prompt: string;
  imageOut: string;
  videoOut?: string;
  animate?: boolean | string;
  aspect?: string;
  count?: number;
  extend?: number;
};

type VideoCreateOptions = AuthenticatedOptions & {
  prompt: string;
  videoOut: string;
  aspect?: string;
  extend?: number;
};

type HistoryDownloadOptions = AuthenticatedOptions & {
  out: string;
  delete?: boolean;
};

type HistoryClearOptions = AuthenticatedOptions & {
  force?: boolean;
};

const VERSION = denoConfig.version;
const MUTATION_PAUSE_MS = 5_000;
const MUTATION_PAUSE_JITTER_MS = 2_000;
const LOGIN_POLL_INTERVAL_MS = 1_000;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

export async function loginCommand(options: LoginOptions): Promise<void> {
  const sessionPath = resolvePath(options.sessionPath);
  const url = options.url ?? "https://meta.ai/create";
  const dependencyChecks = await checkLoginDependencies();
  if (
    !dependencyChecks.playwrightCliAvailable ||
    !dependencyChecks.playwrightCliBrowserReady
  ) {
    throw new Error(dependencyChecks.message);
  }
  const state = await runLoginBootstrap(url);

  if (!hasMetaSessionCookie(state)) {
    throw new Error(
      "A Meta session cookie was not captured. Login may not be complete.",
    );
  }

  const savedPath = await saveStorageState(state, sessionPath);
  const result = {
    ok: true,
    command: "login",
    sessionPath: savedPath,
    cookieCount: state.cookies.length,
    message: `Saved Meta session to ${savedPath}`,
  };

  console.log(formatOutput(result, options.json ?? false));
}

export async function imageCreateCommand(
  options: ImageCreateOptions,
): Promise<void> {
  const prompt = options.prompt;
  const outputImage = options.imageOut;
  const outputVideo = options.videoOut;
  const animationPrompt = normalizeAnimatePrompt(options.animate);
  const aspect = parseAspectRatio(options.aspect, true);
  const count = options.count ?? 1;
  const animate = animationPrompt !== undefined;
  const extendCount = options.extend ?? 0;

  if (!Number.isInteger(count) || count < 1) {
    throw new Error("--count must be a positive integer.");
  }

  if (animate && !outputVideo) {
    throw new Error(
      "image create --animate also requires --video-out so the animated result can be downloaded.",
    );
  }

  if (!animate && outputVideo) {
    throw new Error("image create --video-out requires --animate.");
  }

  if (!animate && extendCount > 0) {
    throw new Error("image create --extend requires --animate.");
  }

  const { client, sessionPath } = await createClient(options.sessionPath);
  const createResult = await client.createImage(prompt, aspect, count);
  const images = ensureUrls(createResult.images, "image");
  const imagePaths = await planNumberedOutputs(
    outputImage,
    images.length,
    ".jpg",
  );
  const imageDownloads = await mapSequentially(images, async (image, index) => {
    const download = await downloadFile(
      image.url,
      imagePaths[index],
      client.getMediaDownloadHeaders(),
    );
    return {
      index: index + 1,
      id: image.id,
      url: image.url,
      thumbnail: image.thumbnail ?? null,
      downloadableFileName: image.downloadableFileName ?? null,
      path: download.path,
      bytes: download.bytes,
      contentType: download.contentType,
    };
  });

  let animationResults: Array<{
    imageIndex: number;
    prompt: string;
    finalVideo: {
      id: string;
      url: string;
      path: string;
      bytes: number;
      contentType: string | null;
      downloadableFileName: string | null;
    };
    lineage: Array<{
      step: string;
      id: string;
      url: string;
      status: string;
    }>;
  }> = [];

  if (animate) {
    const videoPaths = await planNumberedOutputs(
      outputVideo!,
      images.length,
      ".mp4",
    );

    await pauseBetweenMutationJobs();

    animationResults = await mapSequentially(images, async (image, index) => {
      if (index > 0) {
        await pauseBetweenMutationJobs();
      }

      const animatedDraft = await client.animateImage(
        createResult.conversationId,
        createResult.branchPath,
        image,
        animationPrompt,
      );
      let currentBranchPath = animatedDraft.branchPath;
      let currentVideo = await pickFirstCompletedVideo(
        client,
        animatedDraft.videos,
        createResult.conversationId,
      );
      const videoLineage: CompletedVideo[] = [currentVideo];

      for (let i = 0; i < extendCount; i += 1) {
        await pauseBetweenMutationJobs();
        const extendedDraft = await client.extendVideo(
          createResult.conversationId,
          currentBranchPath,
          currentVideo,
        );
        currentBranchPath = extendedDraft.branchPath;
        currentVideo = await pickFirstCompletedVideo(
          client,
          extendedDraft.videos,
          createResult.conversationId,
        );
        videoLineage.push(currentVideo);
      }

      const finalDownload = await downloadFile(
        currentVideo.url,
        videoPaths[index],
        client.getMediaDownloadHeaders(),
      );

      return {
        imageIndex: index + 1,
        prompt: animationPrompt,
        finalVideo: {
          id: currentVideo.id,
          url: currentVideo.url,
          path: finalDownload.path,
          bytes: finalDownload.bytes,
          contentType: finalDownload.contentType,
          downloadableFileName: currentVideo.downloadableFileName ?? null,
        },
        lineage: videoLineage.map((video, lineageIndex) => ({
          step: lineageIndex === 0 ? "animate" : `extend-${lineageIndex}`,
          id: video.id,
          url: video.url,
          status: video.status,
        })),
      };
    });
  }

  const result = {
    ok: true,
    command: "image create",
    sessionPath,
    prompt,
    aspect,
    count,
    conversationId: createResult.conversationId,
    animated: animate,
    extendCount,
    images: imageDownloads,
    animation: animate
      ? {
        prompt: animationPrompt,
        videos: animationResults,
      }
      : null,
    message: animate
      ? `Saved ${imageDownloads.length} image(s) and ${animationResults.length} video(s).`
      : `Saved ${imageDownloads.length} image(s).`,
  };

  console.log(formatOutput(result, options.json ?? false));
}

export async function videoCreateCommand(
  options: VideoCreateOptions,
): Promise<void> {
  const prompt = options.prompt;
  const outputVideo = options.videoOut;
  const aspect = parseAspectRatio(options.aspect, false);
  const extendCount = options.extend ?? 0;

  const { client, sessionPath } = await createClient(options.sessionPath);
  const createResult = await client.createVideo(prompt, aspect);
  const createdVideos = await client.waitForVideos(
    createResult.videos,
    createResult.conversationId,
  );
  const videoPaths = await planNumberedOutputs(
    outputVideo,
    createdVideos.length,
    ".mp4",
  );

  const videos = await mapSequentially(
    createdVideos,
    async (initialVideo, index) => {
      let currentBranchPath = createResult.branchPath;
      let currentVideo = initialVideo;
      const lineage: CompletedVideo[] = [currentVideo];

      for (let i = 0; i < extendCount; i += 1) {
        await pauseBetweenMutationJobs();
        const extendedDraft = await client.extendVideo(
          createResult.conversationId,
          currentBranchPath,
          currentVideo,
        );
        currentBranchPath = extendedDraft.branchPath;
        currentVideo = await pickFirstCompletedVideo(
          client,
          extendedDraft.videos,
          createResult.conversationId,
        );
        lineage.push(currentVideo);
      }

      const videoDownload = await downloadFile(
        currentVideo.url,
        videoPaths[index],
        client.getMediaDownloadHeaders(),
      );

      return {
        index: index + 1,
        id: currentVideo.id,
        url: currentVideo.url,
        path: videoDownload.path,
        bytes: videoDownload.bytes,
        contentType: videoDownload.contentType,
        downloadableFileName: currentVideo.downloadableFileName ?? null,
        sourceMediaUrl: initialVideo.sourceMedia?.url ?? null,
        sourceThumbnail: initialVideo.sourceMedia?.thumbnail ?? null,
        lineage: lineage.map((video, lineageIndex) => ({
          step: lineageIndex === 0 ? "create" : `extend-${lineageIndex}`,
          id: video.id,
          url: video.url,
          status: video.status,
        })),
      };
    },
  );

  const result = {
    ok: true,
    command: "video create",
    sessionPath,
    prompt,
    aspect: aspect ?? null,
    conversationId: createResult.conversationId,
    extendCount,
    videos,
    message: `Saved ${videos.length} video(s).`,
  };

  console.log(formatOutput(result, options.json ?? false));
}

export async function historyDownloadCommand(
  options: HistoryDownloadOptions,
): Promise<void> {
  const outDir = resolvePath(options.out);
  const { client, sessionPath } = await createClient(options.sessionPath);
  const inventory = await collectHistoryInventory(sessionPath);
  const files = await downloadHistoryInventory(
    inventory.entries,
    outDir,
    client.getMediaDownloadHeaders(),
  );

  let deleted: { removedPromptIds: string[] } | null = null;
  if (options.delete) {
    const savedPromptIds = [...new Set(files.map((file) => file.promptId))]
      .sort();
    deleted = await clearHistoryContent(sessionPath, savedPromptIds);
  }

  const imageCount = files.filter((file) => file.kind === "image").length;
  const videoCount = files.filter((file) => file.kind === "video").length;
  const result = {
    ok: true,
    command: "history download",
    sessionPath,
    out: outDir,
    deleteAfterDownload: options.delete ?? false,
    promptCount: inventory.entries.length,
    createIds: inventory.createIds,
    files,
    deletedPromptIds: deleted?.removedPromptIds ?? [],
    message: options.delete
      ? `Saved ${imageCount} image(s) and ${videoCount} video(s), then removed ${deleted?.removedPromptIds.length ?? 0} prompt(s) from Meta history.`
      : `Saved ${imageCount} image(s) and ${videoCount} video(s).`,
  };

  console.log(formatOutput(result, options.json ?? false));
}

export async function historyClearCommand(
  options: HistoryClearOptions,
): Promise<void> {
  if (!options.force) {
    throw new Error("history clear is destructive. Re-run with --force.");
  }

  const { sessionPath } = await createClient(options.sessionPath);
  const deleted = await clearHistoryContent(sessionPath);
  const result = {
    ok: true,
    command: "history clear",
    sessionPath,
    removedPromptIds: deleted.removedPromptIds,
    message: `Removed ${deleted.removedPromptIds.length} prompt(s) from Meta history.`,
  };

  console.log(formatOutput(result, options.json ?? false));
}

function buildCli() {
  return new Command()
    .name("meta-ai")
    .version(VERSION)
    .description(
      "Meta AI media automation CLI. Run login --session-path <path> first, then reuse the same --session-path on every authenticated command.",
    )
    .globalOption("--json", "Emit JSON output.")
    .example(
      "Bootstrap a session",
      "meta-ai --json login --session-path ./.auth/meta-session.json",
    )
    .example(
      "Reuse the saved session on later commands",
      "meta-ai --json image create --session-path ./.auth/meta-session.json --prompt \"a fox in snowfall\" --image-out out/fox",
    )
    .example(
      "Download generated history and remove the prompts that produced the saved files",
      "meta-ai --json history download --session-path ./.auth/meta-session.json --out out/history --delete",
    )
    .command("login")
    .description(
      "Open a browser and save Meta session state to an explicit path.",
    )
    .option(
      "-s, --session-path <path:string>",
      "Where to write the Playwright storage-state JSON.",
      { required: true },
    )
    .option("-u, --url <url:string>", "Start URL.", {
      default: "https://meta.ai/create",
    })
    .example(
      "Save a reusable session",
      "meta-ai login --session-path ./.auth/meta-session.json",
    )
    .action(loginCommand)
    .reset()
    .command(
      "image",
      new Command()
        .description("Image workflows.")
        .command("create")
        .description("Generate images and optionally animate and extend them.")
        .option("-p, --prompt <text:string>", "Image prompt.", {
          required: true,
        })
        .option("-i, --image-out <path:string>", "Base image output path.", {
          required: true,
        })
        .option("-v, --video-out <path:string>", "Base video output path.")
        .option(
          "-a, --animate [text:string]",
          "Animate every generated image; omit text for the default Animate prompt.",
        )
        .option(
          "-r, --aspect <ratio:string>",
          'Aspect ratio: "9:16", "1:1", or "16:9".',
          { default: "9:16" },
        )
        .option("--count <n:integer>", "How many image variants to create.", {
          default: 1,
        })
        .option(
          "--extend <n:integer>",
          "How many times to extend each video.",
          {
            default: 0,
          },
        )
        .option(
          "-s, --session-path <path:string>",
          "Playwright storage-state path created by login.",
          { required: true },
        )
        .example(
          "Create one image",
          'meta-ai --json image create --session-path ./.auth/meta-session.json --prompt "a fox in snowfall" --image-out out/fox --aspect 1:1',
        )
        .example(
          "Create and animate a batch",
          'meta-ai --json image create --session-path ./.auth/meta-session.json --prompt "a neon koi fish in a dark pond" --image-out out/koi --count 2 --animate "slow water ripple and gentle camera drift" --video-out out/koi --extend 2',
        )
        .action(imageCreateCommand),
    )
    .command(
      "video",
      new Command()
        .description("Video workflows.")
        .command("create")
        .description("Generate videos and optionally extend them.")
        .option("-p, --prompt <text:string>", "Video prompt.", {
          required: true,
        })
        .option("-v, --video-out <path:string>", "Base video output path.", {
          required: true,
        })
        .option(
          "-r, --aspect <ratio:string>",
          'Aspect ratio: "9:16", "1:1", or "16:9".',
          { required: true },
        )
        .option(
          "--extend <n:integer>",
          "How many times to extend each video.",
          {
            default: 0,
          },
        )
        .option(
          "-s, --session-path <path:string>",
          "Playwright storage-state path created by login.",
          { required: true },
        )
        .example(
          "Create videos",
          'meta-ai --json video create --session-path ./.auth/meta-session.json --prompt "a paper airplane gliding through clouds" --video-out out/plane --aspect 16:9',
        )
        .action(videoCreateCommand),
    )
    .command(
      "history",
      new Command()
        .description("Download or clear generated Meta AI history.")
        .command(
          "download",
          new Command()
            .description(
              "Download generated media from your Meta create and vibes history.",
            )
            .option(
              "-o, --out <path:string>",
              "Directory where downloaded history files will be written.",
              { required: true },
            )
            .option(
              "--delete",
              "After downloading, remove the related prompts from Meta history.",
            )
            .option(
              "-s, --session-path <path:string>",
              "Playwright storage-state path created by login.",
              { required: true },
            )
            .example(
              "Download all generated media",
              "meta-ai --json history download --session-path ./.auth/meta-session.json --out out/history",
            )
            .example(
              "Download and then remove from Meta history",
              "meta-ai --json history download --session-path ./.auth/meta-session.json --out out/history --delete",
            )
            .action(historyDownloadCommand),
        )
        .command(
          "clear",
          new Command()
            .description("Remove generated prompts from Meta history.")
            .option(
              "--force",
              "Required for this destructive command.",
            )
            .option(
              "-s, --session-path <path:string>",
              "Playwright storage-state path created by login.",
              { required: true },
            )
            .example(
              "Clear generated history",
              "meta-ai --json history clear --session-path ./.auth/meta-session.json --force",
            )
            .action(historyClearCommand),
        ),
    );
}

export async function runCli(args = Deno.args): Promise<void> {
  const json = args.includes("--json");

  try {
    if (isRootVersionRequest(args)) {
      console.log(VERSION);
      return;
    }

    await buildCli().parse(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(formatOutput({ ok: false, message }, json));
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await runCli();
}

function isRootVersionRequest(args: string[]): boolean {
  const commandArgs = args.filter((arg) => arg !== "--json");
  return commandArgs.length === 1 &&
    (commandArgs[0] === "--version" || commandArgs[0] === "-V");
}

async function createClient(sessionPath: string): Promise<{
  client: MetaAiClient;
  sessionPath: string;
}> {
  const resolvedSessionPath = resolvePath(sessionPath);
  const { state } = await loadStorageState(resolvedSessionPath);
  return {
    client: new MetaAiClient(state),
    sessionPath: resolvedSessionPath,
  };
}

function normalizeAnimatePrompt(
  animate?: boolean | string,
): string | undefined {
  if (animate === undefined || animate === false) {
    return undefined;
  }

  if (animate === true) {
    return "Animate";
  }

  return animate;
}

function parseAspectRatio(
  value: string | undefined,
  useDefault: boolean,
): AspectRatio | undefined {
  if (value === undefined) {
    return useDefault ? "9:16" : undefined;
  }

  if (value === "9:16" || value === "1:1" || value === "16:9") {
    return value;
  }

  throw new Error('--aspect must be one of: "9:16", "1:1", "16:9".');
}

function ensureUrls<T extends GeneratedImage | CompletedVideo>(
  variants: T[],
  label: string,
): Array<T & { url: string }> {
  return variants.map((variant, index) => {
    if (!variant.url) {
      throw new Error(
        `Returned ${label} variant ${index + 1} does not have a URL.`,
      );
    }

    return {
      ...variant,
      url: variant.url,
    };
  });
}

async function pickFirstCompletedVideo(
  client: MetaAiClient,
  variants: GeneratedVideo[],
  conversationId: string,
): Promise<CompletedVideo> {
  const completed = await client.waitForVideos(variants, conversationId);
  const video = completed[0];
  if (!video) {
    throw new Error("Meta did not return a completed video variant.");
  }
  return video;
}

async function mapSequentially<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += 1) {
    results.push(await worker(items[index], index));
  }
  return results;
}

async function pauseBetweenMutationJobs(): Promise<void> {
  const jitter = Math.floor(Math.random() * (MUTATION_PAUSE_JITTER_MS + 1));
  await new Promise((resolve) =>
    setTimeout(resolve, MUTATION_PAUSE_MS + jitter)
  );
}

async function runLoginBootstrap(url: string): Promise<StorageState> {
  return await runLoginBootstrapWithPlaywrightCli(url);
}

async function runLoginBootstrapWithPlaywrightCli(
  url: string,
): Promise<StorageState> {
  console.error("Opening Meta login browser via playwright-cli...");
  const sessionName = generatePlaywrightCliSessionName("meta-ai-login");
  const tempStatePath = await Deno.makeTempFile({ suffix: ".json" });

  try {
    await openPlaywrightCliSession(sessionName, {
      url,
      headed: true,
    });
    console.error("Opened browser via playwright-cli.");
    console.error(
      "Complete the Meta login in the opened browser. The session will be saved automatically once the Meta auth cookie is detected.",
    );
    await waitForMetaSessionCookieInPlaywrightCliSession(
      sessionName,
      tempStatePath,
    );
    const { state } = await loadStorageState(tempStatePath);
    return state;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to launch playwright-cli browser session: ${message}`);
  } finally {
    await closePlaywrightCliSession(sessionName).catch(() => undefined);
    await Deno.remove(tempStatePath).catch(() => undefined);
  }
}

async function checkLoginDependencies() {
  return await checkPlaywrightCliDependencies();
}

async function waitForMetaSessionCookieInPlaywrightCliSession(
  sessionName: string,
  tempStatePath: string,
): Promise<void> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await savePlaywrightCliState(sessionName, tempStatePath);
    const { state } = await loadStorageState(tempStatePath);
    if (hasMetaSessionCookie(state)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, LOGIN_POLL_INTERVAL_MS));
  }

  throw new Error(
    "Timed out waiting for a Meta session cookie. Complete login in the opened browser and try again.",
  );
}
