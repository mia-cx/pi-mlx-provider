import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ProviderModelConfig,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import {
  getKeybindings,
  parseKey,
  SelectList,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { parseMlxCommand } from "../commands/parse";
import {
  type CachedModel,
  mergeCachedModelsWithKnownIds,
  scanCachedModels,
} from "../models/cached-models";
import {
  createModelDownloadPlan,
  modelDownloadFailureMessage,
} from "../models/model-download";
import { buildLmServerCommand } from "../provider/lm-adapter";
import { createEnvironmentInstallPlan } from "../runtimes/environment-manager";
import { ProcessManager } from "../runtimes/process-manager";
import { RuntimeServerManager } from "../runtimes/server-manager";
import { ConfigStore } from "../storage/config-store";
import { redactLogText } from "../storage/logs";
import { extensionPaths } from "../storage/paths";
import { formatTokens, renderStatusText } from "../ui/status-view-model";
import { spawnWithArgs } from "../utils/spawn";

const PROVIDER = "mlx";
const HOST = "127.0.0.1";
const PORT = 11439;
const DEFAULT_CONTEXT_WINDOW = 128_000;

export type MlxPiExtensionOptions = {
  extensionDir?: string;
  cacheRoots?: string[];
  host?: string;
  port?: number;
  scanCachedModels?: (input: {
    cacheRoots: string[];
  }) => Promise<CachedModel[]>;
};

export default async function mlxExtension(pi: ExtensionAPI): Promise<void> {
  await registerPiExtension(pi);
}

export async function registerPiExtension(
  pi: ExtensionAPI,
  options: MlxPiExtensionOptions = {},
): Promise<void> {
  const runtime = new MlxExtensionRuntime(pi, options);

  await runtime.refreshProvider();

  pi.registerCommand("mlx", {
    description: "Manage local MLX Hugging Face models",
    getArgumentCompletions: (prefix) => completeMlxArguments(prefix),
    handler: async (args, ctx) => {
      await runtime.handleCommand(args, ctx);
    },
  });

  pi.on("model_select", async (event, ctx) => {
    if (event.model.provider === PROVIDER) {
      await runtime.ensureServer(event.model.id, ctx);
      return;
    }

    runtime.updateStickyWidget(ctx, { selectedModelIsMlx: false });
  });

  pi.on("before_provider_request", async (event, ctx) => {
    if (ctx.model?.provider !== PROVIDER) return;
    await runtime.ensureServer(ctx.model.id, ctx);
    return runtime.applyMaxTokens(event.payload);
  });

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.model?.provider === PROVIDER) {
      await runtime.ensureServer(ctx.model.id, ctx);
      return;
    }

    runtime.updateStickyWidget(ctx);
  });

  pi.on("session_shutdown", async () => {
    await runtime.stopAll();
  });
}

export const registerMlxExtension = registerPiExtension;

type MlxDialogAction =
  | "status"
  | "start"
  | "stop"
  | "context"
  | "tokens"
  | "reset-tokens"
  | "refresh"
  | "logs";

type ContextPresetAction =
  | "auto"
  | "32k"
  | "64k"
  | "128k"
  | "256k"
  | "1m"
  | "custom";

type MaxTokensPresetAction =
  | "auto"
  | "4k"
  | "8k"
  | "16k"
  | "32k"
  | "64k"
  | "128k"
  | "custom";

type MenuItem<T extends string> = {
  label: string;
  value: T;
  detail?: string;
};

type PrewarmModelSelection =
  | { kind: "cached"; modelId: string }
  | { kind: "download"; modelId: string };

type ProgressIndicator = {
  label: string;
  startedAt: number;
  startPercent: number;
  maxPercent: number;
};

class MlxExtensionRuntime {
  readonly #pi: ExtensionAPI;
  readonly #extensionDir: string;
  readonly #cacheRoots: string[];
  readonly #host: string;
  readonly #port: number;
  readonly #scanCachedModels: (input: {
    cacheRoots: string[];
  }) => Promise<CachedModel[]>;
  readonly #processes = new ProcessManager();
  readonly #server = new RuntimeServerManager();
  readonly #configStore: ConfigStore;
  #cachedModels: CachedModel[] = [];
  #knownModelIds = new Set<string>();
  #contextWindow = DEFAULT_CONTEXT_WINDOW;
  #maxTokens = DEFAULT_CONTEXT_WINDOW;
  #activity: string | null = null;
  #progress: ProgressIndicator | null = null;
  #progressTimer: ReturnType<typeof setInterval> | null = null;

  constructor(pi: ExtensionAPI, options: MlxPiExtensionOptions) {
    this.#pi = pi;
    this.#extensionDir =
      options.extensionDir ?? join(homedir(), ".pi", "agent", "mlx-provider");
    this.#cacheRoots = options.cacheRoots ?? [defaultHuggingFaceCacheRoot()];
    this.#host = options.host ?? HOST;
    this.#port = options.port ?? PORT;
    this.#scanCachedModels = options.scanCachedModels ?? scanCachedModels;
    this.#configStore = new ConfigStore(
      extensionPaths(this.#extensionDir).config,
    );
  }

  async refreshProvider(): Promise<void> {
    const config = await this.#configStore.load();
    this.#contextWindow = config.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
    this.#maxTokens = config.maxTokens ?? this.#contextWindow;
    this.#cachedModels = mergeCachedModelsWithKnownIds(
      await this.#scanCachedModels({
        cacheRoots: this.#cacheRoots,
      }),
      this.#knownModelIds,
    );
    this.#pi.registerProvider(PROVIDER, {
      name: "MLX",
      baseUrl: `http://${this.#host}:${this.#port}/v1`,
      apiKey: "local",
      api: "openai-completions",
      models: this.#cachedModels.map((model) =>
        toProviderModel(model, this.#contextWindow, this.#maxTokens),
      ),
    });
  }

  async handleCommand(
    args: string,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    const rawArgs = args.trim();
    const command = parseMlxCommand(`/mlx${rawArgs ? ` ${rawArgs}` : ""}`);

    switch (command.type) {
      case "status":
        if (!rawArgs && ctx.hasUI) {
          await this.#showDialog(ctx);
          return;
        }
        ctx.ui.notify(this.#statusText(), "info");
        return;
      case "start": {
        const modelId = command.modelId ?? selectedMlxModelId(ctx);
        if (!modelId) {
          ctx.ui.notify(
            "Usage: /mlx start <model-id> (or select an MLX model first)",
            "warning",
          );
          return;
        }
        await this.ensureServer(modelId, ctx);
        return;
      }
      case "stop":
        await this.stopAll();
        this.updateStickyWidget(ctx);
        ctx.ui.notify("Stopped MLX runtime servers", "info");
        return;
      case "logs":
        ctx.ui.notify(await this.#logTail(), "info");
        return;
      case "context":
        await this.#handleContext(command.value, ctx);
        return;
      case "tokens":
        await this.#handleMaxTokens(command.value, ctx);
        return;
      case "init":
        await this.#handleInit(command.target, ctx);
        return;
      case "reprobe":
        ctx.ui.notify(
          `Reprobe is not needed yet for ${command.modelId}; server startup verifies the runtime.`,
          "info",
        );
        return;
      case "max":
        if (command.key === "context") {
          await this.#handleContext(command.value, ctx);
          return;
        }
        if (command.key === "tokens") {
          await this.#handleMaxTokens(command.value, ctx);
          return;
        }
        ctx.ui.notify(
          `/${command.type} ${command.key} is parsed but not wired yet`,
          "warning",
        );
        return;
      default:
        ctx.ui.notify(
          `/${command.type} is parsed but not wired yet`,
          "warning",
        );
    }
  }

  applyMaxTokens(payload: unknown): unknown {
    if (!isRecord(payload)) return payload;

    const next: Record<string, unknown> = {
      ...payload,
      max_tokens: this.#maxTokens,
    };
    delete next.max_completion_tokens;
    return next;
  }

  async ensureServer(modelId: string, ctx: ExtensionContext): Promise<void> {
    const current = this.#server.status();
    if (current.status === "running" && current.modelId === modelId) {
      this.updateStickyWidget(ctx, { selectedModelIsMlx: true });
      return;
    }

    await this.stopAll();
    this.#activity = `loading ${modelId}`;
    this.updateStickyWidget(ctx);
    await this.#ensureLmEnvironment(ctx);
    await mkdir(this.#logDir(), { recursive: true });

    const pythonPath = this.#pythonPath("lm", "default");
    const command = buildLmServerCommand({
      pythonPath,
      modelId,
      host: this.#host,
      port: this.#port,
    });
    const child = spawnWithArgs(command);
    if (!child.pid) throw new Error("MLX runtime process did not expose a pid");

    const logPath = this.#activeLogPath();
    const logStream = createWriteStream(logPath, { flags: "a" });
    child.stdout?.pipe(logStream, { end: false });
    child.stderr?.pipe(logStream, { end: false });

    this.#processes.track({
      pid: child.pid,
      modelId,
      environment: "lm/default",
    });
    await this.#server.prewarm({
      modelId,
      environment: "lm/default",
      pid: child.pid,
    });
    ctx.ui.setStatus("mlx", `MLX ${modelId}`);
    await waitForReady(`http://${this.#host}:${this.#port}/v1/models`);
    this.#activity = null;
    this.updateStickyWidget(ctx);
  }

  async stopAll(): Promise<void> {
    await this.#processes.stopAll();
    this.#server.stopAll();
    this.#stopProgress();
  }

  async #handleContext(
    value: string | undefined,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    if (!value) {
      ctx.ui.notify(
        `MLX context window is ${formatTokens(this.#contextWindow)}. Use /mlx context <tokens|auto> to change it.`,
        "info",
      );
      return;
    }

    const config = await this.#configStore.load();
    if (value === "auto" || value === "default") {
      delete config.contextWindow;
      await this.#configStore.save(config);
      await this.refreshProvider();
      this.updateStickyWidget(ctx);
      ctx.ui.notify(
        `MLX context window reset to ${formatTokens(this.#contextWindow)}.`,
        "info",
      );
      return;
    }

    const contextWindow = parseTokenCount(value, {
      min: 4096,
      label: "Context window",
    });
    await this.#configStore.save({ ...config, contextWindow });
    await this.refreshProvider();
    this.updateStickyWidget(ctx);
    ctx.ui.notify(
      `MLX context window set to ${formatTokens(contextWindow)}.`,
      "info",
    );
  }

  async #handleMaxTokens(
    value: string | undefined,
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    if (!value) {
      ctx.ui.notify(
        `MLX max output tokens is ${formatTokens(this.#maxTokens)}. Use /mlx max tokens <tokens|auto> to change it; auto follows the context window.`,
        "info",
      );
      return;
    }

    const config = await this.#configStore.load();
    if (value === "auto" || value === "default" || value === "context") {
      delete config.maxTokens;
      await this.#configStore.save(config);
      await this.refreshProvider();
      this.updateStickyWidget(ctx);
      ctx.ui.notify(
        `MLX max output tokens reset to ${formatTokens(this.#maxTokens)} (context window).`,
        "info",
      );
      return;
    }

    const maxTokens = parseTokenCount(value, {
      min: 1,
      label: "Max output tokens",
    });
    await this.#configStore.save({ ...config, maxTokens });
    await this.refreshProvider();
    this.updateStickyWidget(ctx);
    ctx.ui.notify(
      `MLX max output tokens set to ${formatTokens(maxTokens)}.`,
      "info",
    );
  }

  async #showDialog(ctx: ExtensionCommandContext): Promise<void> {
    const action = await this.#showOverlayMenu<MlxDialogAction>(ctx, "MLX", [
      { label: "Status", value: "status", detail: "Show runtime state" },
      {
        label: "Prewarm model…",
        value: "start",
        detail: `${this.#cachedModels.length} cached`,
      },
      { label: "Stop runtime", value: "stop", detail: "Unload MLX server" },
      {
        label: "Set context window…",
        value: "context",
        detail: formatTokens(this.#contextWindow),
      },
      {
        label: "Set max output tokens…",
        value: "tokens",
        detail: formatTokens(this.#maxTokens),
      },
      {
        label: "Reset max output tokens",
        value: "reset-tokens",
        detail: "follow context window",
      },
      {
        label: "Refresh cached models",
        value: "refresh",
        detail: "Rescan Hugging Face cache",
      },
      { label: "Logs", value: "logs", detail: "Show active runtime tail" },
    ]);

    switch (action) {
      case "status":
        ctx.ui.notify(this.#statusText(), "info");
        return;
      case "start":
        await this.#showStartModelDialog(ctx);
        return;
      case "stop":
        await this.stopAll();
        this.updateStickyWidget(ctx);
        ctx.ui.notify("Stopped MLX runtime servers", "info");
        return;
      case "context":
        await this.#showContextDialog(ctx);
        return;
      case "tokens":
        await this.#showMaxTokensDialog(ctx);
        return;
      case "reset-tokens":
        await this.#handleMaxTokens("auto", ctx);
        return;
      case "refresh":
        await this.refreshProvider();
        this.updateStickyWidget(ctx);
        ctx.ui.notify(
          `Found ${this.#cachedModels.length} cached MLX model(s).`,
          "info",
        );
        return;
      case "logs":
        ctx.ui.notify(await this.#logTail(), "info");
        return;
    }
  }

  async #showStartModelDialog(ctx: ExtensionCommandContext): Promise<void> {
    await this.refreshProvider();

    const selection = await ctx.ui.custom<PrewarmModelSelection | undefined>(
      (_tui, theme, _keybindings, done) =>
        new MlxModelSearchOverlay(
          theme,
          "Prewarm MLX model",
          this.#dialogSummary(),
          this.#cachedModels,
          done,
        ),
      {
        overlay: true,
        overlayOptions: { anchor: "center", width: 84, maxHeight: 24 },
      },
    );

    if (!selection) return;
    if (selection.kind === "download") {
      const downloaded = await this.#downloadModel(selection.modelId, ctx);
      if (!downloaded) return;
    }

    await this.ensureServer(selection.modelId, ctx);
  }

  async #showContextDialog(ctx: ExtensionCommandContext): Promise<void> {
    const preset = await this.#showOverlayMenu<ContextPresetAction>(
      ctx,
      "MLX context window",
      [
        { label: "32k", value: "32k", detail: "small" },
        { label: "64k", value: "64k", detail: "usable minimum" },
        { label: "128k", value: "128k", detail: "default" },
        { label: "256k", value: "256k", detail: "large" },
        { label: "1m", value: "1m", detail: "only for capable models" },
        { label: "Auto", value: "auto", detail: "reset to default" },
        { label: "Custom…", value: "custom", detail: "type a token count" },
      ],
    );

    if (!preset) return;
    if (preset === "custom") {
      const value = await ctx.ui.input(
        "MLX context window",
        `${this.#contextWindow}`,
      );
      if (value) await this.#handleContext(value, ctx);
      return;
    }

    await this.#handleContext(preset, ctx);
  }

  async #showMaxTokensDialog(ctx: ExtensionCommandContext): Promise<void> {
    const preset = await this.#showOverlayMenu<MaxTokensPresetAction>(
      ctx,
      "MLX max output tokens",
      [
        { label: "4k", value: "4k", detail: "small" },
        { label: "8k", value: "8k", detail: "larger answers" },
        { label: "16k", value: "16k", detail: "reasoning traces" },
        { label: "32k", value: "32k", detail: "long tool loops" },
        { label: "64k", value: "64k", detail: "very large" },
        { label: "128k", value: "128k", detail: "default context" },
        { label: "Auto", value: "auto", detail: "follow context window" },
        { label: "Custom…", value: "custom", detail: "type a token count" },
      ],
    );

    if (!preset) return;
    if (preset === "custom") {
      const value = await ctx.ui.input(
        "MLX max output tokens",
        `${this.#maxTokens}`,
      );
      if (value) await this.#handleMaxTokens(value, ctx);
      return;
    }

    await this.#handleMaxTokens(preset, ctx);
  }

  async #showOverlayMenu<T extends string>(
    ctx: ExtensionCommandContext,
    title: string,
    items: Array<MenuItem<T>>,
  ): Promise<T | undefined> {
    return ctx.ui.custom<T | undefined>(
      (_tui, theme, _keybindings, done) =>
        new MlxMenuOverlay(theme, title, this.#dialogSummary(), items, done),
      {
        overlay: true,
        overlayOptions: { anchor: "center", width: 72, maxHeight: 24 },
      },
    );
  }

  #dialogSummary(): string[] {
    const status = this.#server.status();
    return [
      `Server: ${status.status}`,
      `Model: ${status.modelId ?? "none"}`,
      `Context: ${formatTokens(this.#contextWindow)}`,
      `Max output: ${formatTokens(this.#maxTokens)}`,
      `Activity: ${this.#activity ?? "idle"}`,
    ];
  }

  async #downloadModel(
    modelId: string,
    ctx: ExtensionContext,
  ): Promise<boolean> {
    const plan = createModelDownloadPlan(modelId);
    const planText = `${plan.command} ${plan.args.join(" ")}`;

    if (ctx.hasUI) {
      const ok = await ctx.ui.confirm(
        "Download Hugging Face model?",
        [
          `Download ${modelId} into the Hugging Face cache, then prewarm it.`,
          "",
          "Plan:",
          `- ${planText}`,
          `- Model card: https://huggingface.co/${modelId}`,
        ].join("\n"),
      );
      if (!ok) return false;
    }

    this.#startProgress(ctx, `downloading ${modelId}`, {
      startPercent: 0,
      maxPercent: 95,
    });

    const result = await this.#pi.exec(plan.command, plan.args).finally(() => {
      this.#stopProgress();
      this.updateStickyWidget(ctx);
    });

    if (result.code !== 0) {
      ctx.ui.notify(
        modelDownloadFailureMessage(
          modelId,
          result.stderr || result.stdout || `exit ${result.code}`,
        ),
        "error",
      );
      this.updateStickyWidget(ctx);
      return false;
    }

    this.#knownModelIds.add(modelId);
    await this.refreshProvider();
    ctx.modelRegistry?.refresh();
    ctx.ui.notify(`Downloaded ${modelId}.`, "info");
    this.updateStickyWidget(ctx);
    return true;
  }

  updateStickyWidget(
    ctx: ExtensionContext,
    options: { selectedModelIsMlx?: boolean } = {},
  ): void {
    const status = this.#server.status();
    const selectedModelIsMlx =
      options.selectedModelIsMlx ?? ctx.model?.provider === PROVIDER;
    const prewarmedModelId = status.prewarmed ? status.modelId : undefined;

    if (!selectedModelIsMlx && !prewarmedModelId && !this.#activity) {
      ctx.ui.setWidget("mlx", undefined);
      ctx.ui.setStatus("mlx", undefined);
      return;
    }

    const model = status.modelId ?? ctx.model?.id ?? "no model loaded";
    const lines = [
      `MLX: ${status.status} · ${model}`,
      `Context: ${formatTokens(this.#contextWindow)} · Max output: ${formatTokens(this.#maxTokens)} · Reasoning: model-dependent`,
    ];

    if (this.#activity) lines.push(`Activity: ${this.#activity}`);
    if (this.#progress) {
      lines.push(`Progress: ${renderProgressBar(this.#progressPercent())}`);
    }
    ctx.ui.setWidget("mlx", lines, { placement: "aboveEditor" });
    ctx.ui.setStatus("mlx", this.#activity ?? `MLX ${status.status}`);
  }

  #startProgress(
    ctx: ExtensionContext,
    label: string,
    range: { startPercent: number; maxPercent: number },
  ): void {
    this.#stopProgress();
    this.#activity = label;
    this.#progress = {
      label,
      startedAt: Date.now(),
      startPercent: range.startPercent === 0 ? 5 : range.startPercent,
      maxPercent: range.maxPercent,
    };
    this.updateStickyWidget(ctx);
    this.#progressTimer = setInterval(() => {
      this.updateStickyWidget(ctx);
    }, 1_000);
  }

  #stopProgress(): void {
    if (this.#progressTimer) clearInterval(this.#progressTimer);
    this.#progressTimer = null;
    this.#progress = null;
    this.#activity = null;
  }

  #progressPercent(): number {
    if (!this.#progress) return 0;

    const elapsedSeconds = (Date.now() - this.#progress.startedAt) / 1_000;
    const fill = elapsedSeconds * 0.75;
    return Math.min(
      this.#progress.maxPercent,
      Math.floor(this.#progress.startPercent + fill),
    );
  }

  async #handleInit(
    target: {
      kind: string;
      modelId?: string;
      environment?: string;
      version?: string;
    },
    ctx: ExtensionCommandContext,
  ): Promise<void> {
    if (target.kind === "all") {
      await this.refreshProvider();
      ctx.ui.notify(
        `Found ${this.#cachedModels.length} cached MLX model(s).`,
        "info",
      );
      return;
    }

    if (target.kind === "environment") {
      await this.#installEnvironment(
        target.environment ?? "lm",
        target.version ?? "default",
        ctx,
      );
      return;
    }

    if (target.modelId) {
      await this.#ensureLmEnvironment(ctx);
      await this.refreshProvider();
      ctx.ui.notify(`Initialized ${target.modelId} with lm/default`, "info");
    }
  }

  async #ensureLmEnvironment(ctx: ExtensionContext): Promise<void> {
    const pythonPath = this.#pythonPath("lm", "default");
    if (existsSync(pythonPath)) return;

    if (ctx.hasUI) {
      const ok = await ctx.ui.confirm(
        "Install mlx-lm?",
        `pi-mlx-provider needs an extension-managed mlx-lm environment at:\n${this.#environmentRoot("lm", "default")}`,
      );
      if (!ok) throw new Error("MLX runtime install declined");
    }

    await this.#installEnvironment("lm", "default", ctx);
  }

  async #installEnvironment(
    environment: string,
    version: string,
    ctx: ExtensionContext,
  ): Promise<void> {
    const plan = createEnvironmentInstallPlan({
      extensionDir: this.#extensionDir,
      environment: environment as "lm" | "vlm" | "optiq",
      version,
    });

    for (const [index, command] of plan.commands.entries()) {
      const commandText = `${command.command} ${command.args.join(" ")}`;
      this.#startProgress(
        ctx,
        `installing ${environment}/${version}: ${commandText}`,
        {
          startPercent: Math.floor((index / plan.commands.length) * 100),
          maxPercent:
            index === plan.commands.length - 1
              ? 95
              : Math.floor(((index + 1) / plan.commands.length) * 100),
        },
      );

      const result = await this.#pi
        .exec(command.command, command.args)
        .finally(() => {
          this.#stopProgress();
          this.updateStickyWidget(ctx);
        });
      if (result.code !== 0) {
        throw new Error(
          result.stderr ||
            result.stdout ||
            `Command failed: ${command.command}`,
        );
      }
    }
  }

  #statusText(): string {
    const status = this.#server.status();
    return renderStatusText({
      server: {
        status: status.status,
        ...(status.modelId ? { modelId: status.modelId } : {}),
        ...(status.environment ? { environment: status.environment } : {}),
        ...(status.prewarmed !== undefined
          ? { prewarmed: status.prewarmed }
          : {}),
      },
      download: { downloadStatus: "idle" },
      contextWindow: this.#contextWindow,
      maxTokens: this.#maxTokens,
      activity: this.#activity,
    });
  }

  async #logTail(): Promise<string> {
    try {
      const text = await readFile(this.#activeLogPath(), "utf8");
      return redactLogText(text.split("\n").slice(-80).join("\n"));
    } catch {
      return "No MLX runtime logs yet.";
    }
  }

  #environmentRoot(environment: string, version: string): string {
    return join(
      this.#extensionDir,
      "environments",
      environment,
      version,
      ".venv",
    );
  }

  #pythonPath(environment: string, version: string): string {
    return join(this.#environmentRoot(environment, version), "bin", "python");
  }

  #logDir(): string {
    return join(this.#extensionDir, "logs");
  }

  #activeLogPath(): string {
    return join(this.#logDir(), "active.log");
  }
}

class MlxModelSearchOverlay implements Component {
  readonly #theme: Theme;
  readonly #title: string;
  readonly #summary: string[];
  readonly #models: CachedModel[];
  readonly #done: (result: PrewarmModelSelection | undefined) => void;
  #query = "";
  #selectedIndex = 0;

  constructor(
    theme: Theme,
    title: string,
    summary: string[],
    models: CachedModel[],
    done: (result: PrewarmModelSelection | undefined) => void,
  ) {
    this.#theme = theme;
    this.#title = title;
    this.#summary = summary;
    this.#models = models;
    this.#done = done;
  }

  handleInput(data: string): void {
    const kb = getKeybindings();

    if (kb.matches(data, "tui.select.confirm")) {
      const item = this.#items()[this.#selectedIndex];
      if (item) this.#done(item.selection);
      return;
    }

    if (kb.matches(data, "tui.select.cancel")) {
      this.#done(undefined);
      return;
    }

    if (kb.matches(data, "tui.select.up")) {
      this.#moveSelection(-1);
      return;
    }

    if (kb.matches(data, "tui.select.down")) {
      this.#moveSelection(1);
      return;
    }

    if (kb.matches(data, "tui.editor.deleteCharBackward")) {
      this.#query = [...this.#query].slice(0, -1).join("");
      this.#selectedIndex = 0;
      return;
    }

    const printable = printableInput(data);
    if (printable) {
      this.#query += printable;
      this.#selectedIndex = 0;
    }
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const query =
      this.#query ||
      this.#theme.fg(
        "dim",
        "type to search cached models or enter owner/model",
      );
    const items = this.#items();
    const visibleItems = items.slice(0, Math.max(1, 14 - this.#summary.length));
    const lines = [
      ...this.#summary.map((line) => ` ${this.#theme.fg("dim", line)}`),
      "",
      ` Search: ${query}`,
      "",
    ];

    if (visibleItems.length) {
      for (const [index, item] of visibleItems.entries()) {
        const selected = index === this.#selectedIndex;
        const prefix = selected ? this.#theme.fg("accent", "› ") : "  ";
        const label = selected
          ? this.#theme.fg("accent", item.label)
          : item.label;
        lines.push(
          `${prefix}${truncateToWidth(label, Math.max(1, innerWidth - 2), "...", true)}`,
        );
        if (item.detail) {
          lines.push(`  ${this.#theme.fg("dim", item.detail)}`);
        }
      }
    } else {
      lines.push(
        ` ${this.#theme.fg("dim", "Type a Hugging Face model id to download and prewarm it.")}`,
      );
    }

    lines.push(
      "",
      ` ${this.#theme.fg("dim", "Type search · ↑/↓ move · Enter select · Esc close")}`,
    );

    return this.#box(lines, width);
  }

  invalidate(): void {}

  dispose(): void {}

  #items(): Array<{
    label: string;
    detail?: string;
    selection: PrewarmModelSelection;
  }> {
    const query = this.#query.trim();
    const normalizedQuery = query.toLowerCase();
    const matches = this.#models.filter(
      (model) =>
        !normalizedQuery ||
        model.modelId.toLowerCase().includes(normalizedQuery),
    );

    if (query && matches.length === 0) {
      return [
        {
          label: `Download '${query}' from Hugging Face`,
          detail: "Shows a confirmation plan before downloading.",
          selection: { kind: "download", modelId: query },
        },
      ];
    }

    return matches.map((model) => ({
      label: model.modelId,
      detail: "cached · prewarm without switching /model",
      selection: { kind: "cached", modelId: model.modelId },
    }));
  }

  #moveSelection(delta: number): void {
    const count = this.#items().length;
    if (!count) return;
    this.#selectedIndex = (this.#selectedIndex + delta + count) % count;
  }

  #box(lines: string[], width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const title = truncateToWidth(` ${this.#title} `, innerWidth).trimEnd();
    const titleWidth = visibleWidth(title);
    const left = "─".repeat(Math.floor((innerWidth - titleWidth) / 2));
    const right = "─".repeat(
      Math.max(0, innerWidth - titleWidth - left.length),
    );
    const output = [
      this.#theme.fg("border", `╭${left}`) +
        this.#theme.fg("accent", title) +
        this.#theme.fg("border", `${right}╮`),
    ];

    for (const line of lines) {
      output.push(
        this.#theme.fg("border", "│") +
          truncateToWidth(line, innerWidth, "...", true) +
          this.#theme.fg("border", "│"),
      );
    }

    output.push(this.#theme.fg("border", `╰${"─".repeat(innerWidth)}╯`));
    return output;
  }
}

class MlxMenuOverlay<T extends string> implements Component {
  readonly #theme: Theme;
  readonly #title: string;
  readonly #summary: string[];
  readonly #list: SelectList;

  constructor(
    theme: Theme,
    title: string,
    summary: string[],
    items: Array<MenuItem<T>>,
    done: (result: T | undefined) => void,
  ) {
    this.#theme = theme;
    this.#title = title;
    this.#summary = summary;
    this.#list = new SelectList(
      items.map(toSelectItem),
      Math.min(items.length, 12),
      {
        selectedPrefix: (text) => theme.fg("accent", text),
        selectedText: (text) => theme.fg("accent", text),
        description: (text) => theme.fg("dim", text),
        scrollInfo: (text) => theme.fg("dim", text),
        noMatch: (text) => theme.fg("warning", text),
      },
      {
        minPrimaryColumnWidth: 1,
        maxPrimaryColumnWidth: 10_000,
        truncatePrimary: ({ text, maxWidth }) =>
          truncatePreservingSuffix(text, maxWidth),
      },
    );
    this.#list.onSelect = (item) => done(item.value as T);
    this.#list.onCancel = () => done(undefined);
  }

  handleInput(data: string): void {
    this.#list.handleInput(data);
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const content = [
      ...this.#summary.map((line) => ` ${this.#theme.fg("dim", line)}`),
      "",
      ...this.#list.render(innerWidth),
      "",
      ` ${this.#theme.fg("dim", "↑/↓ move · Enter select · Esc close")}`,
    ];

    return this.#box(content, width);
  }

  invalidate(): void {}

  dispose(): void {}

  #box(lines: string[], width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const title = truncateToWidth(` ${this.#title} `, innerWidth).trimEnd();
    const titleWidth = visibleWidth(title);
    const left = "─".repeat(Math.floor((innerWidth - titleWidth) / 2));
    const right = "─".repeat(
      Math.max(0, innerWidth - titleWidth - left.length),
    );
    const output = [
      this.#theme.fg("border", `╭${left}`) +
        this.#theme.fg("accent", title) +
        this.#theme.fg("border", `${right}╮`),
    ];

    for (const line of lines) {
      output.push(
        this.#theme.fg("border", "│") +
          truncateToWidth(line, innerWidth, "...", true) +
          this.#theme.fg("border", "│"),
      );
    }

    output.push(this.#theme.fg("border", `╰${"─".repeat(innerWidth)}╯`));
    return output;
  }
}

function printableInput(data: string): string | undefined {
  if (data.length === 1 && data >= " " && data !== "\u007f") return data;

  const parsed = parseKey(data);
  return parsed?.length === 1 ? parsed : undefined;
}

function toSelectItem<T extends string>(item: MenuItem<T>): SelectItem {
  return {
    value: item.value,
    label: item.label,
    ...(item.detail ? { description: item.detail } : {}),
  };
}

function selectedMlxModelId(ctx: ExtensionContext): string | undefined {
  return ctx.model?.provider === PROVIDER ? ctx.model.id : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderProgressBar(percent: number): string {
  const width = 20;
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.floor((clamped / 100) * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${clamped}%`;
}

function truncatePreservingSuffix(text: string, maxWidth: number): string {
  if (visibleWidth(text) <= maxWidth) return text;
  if (maxWidth <= 1) return truncateToWidth(text, maxWidth, "");

  const marker = "…";
  const slashIndex = text.indexOf("/");
  const prefix = slashIndex === -1 ? "" : text.slice(0, slashIndex + 1);
  const prefixWidth = visibleWidth(prefix);

  if (prefix && prefixWidth < maxWidth / 2) {
    const suffixWidth = maxWidth - prefixWidth - visibleWidth(marker);
    return `${prefix}${marker}${takeVisibleSuffix(text, suffixWidth)}`;
  }

  return `${marker}${takeVisibleSuffix(text, maxWidth - visibleWidth(marker))}`;
}

function takeVisibleSuffix(text: string, maxWidth: number): string {
  let suffix = "";

  for (const char of [...text].reverse()) {
    if (visibleWidth(`${char}${suffix}`) > maxWidth) break;
    suffix = `${char}${suffix}`;
  }

  return suffix;
}

function defaultHuggingFaceCacheRoot(): string {
  return (
    process.env.HF_HUB_CACHE ?? join(homedir(), ".cache", "huggingface", "hub")
  );
}

function toProviderModel(
  model: CachedModel,
  contextWindow: number,
  maxTokens: number,
): ProviderModelConfig {
  return {
    id: model.modelId,
    name: model.modelId,
    reasoning: isReasoningCapable(model.modelId),
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens,
    compat: { maxTokensField: "max_tokens" },
  };
}

function isReasoningCapable(modelId: string): boolean {
  return /(^|[/_-])(deepseek[-_]?r1|qwq|qwen3|thinking|reasoning|gpt[-_]?oss)([/_-]|$)/i.test(
    modelId,
  );
}

function parseTokenCount(
  input: string,
  options: { min: number; label: string },
): number {
  const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*([km]?)$/i);
  if (!match) throw new Error(`Invalid token count: ${input}`);

  const value = Number(match[1]);
  const unit = (match[2] ?? "").toLowerCase();
  const multiplier = unit === "m" ? 1_000_000 : unit === "k" ? 1_000 : 1;
  const tokens = Math.round(value * multiplier);

  if (tokens < options.min) {
    throw new Error(
      `${options.label} must be at least ${formatTokens(options.min)} tokens`,
    );
  }
  return tokens;
}

async function waitForReady(url: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`MLX runtime did not become ready: ${String(lastError)}`);
}

function completeMlxArguments(
  prefix: string,
): Array<{ value: string; label: string }> | null {
  const completions = [
    "status",
    "init ",
    "init --all",
    "start ",
    "stop",
    "logs",
    "reprobe ",
    "context ",
    "context auto",
    "tokens ",
    "tokens auto",
    "max-tokens ",
    "max-tokens auto",
    "runtime set ",
    "max memory ",
    "max models ",
    "max context ",
    "max tokens ",
    "max output ",
  ];
  const matches = completions.filter((completion) =>
    completion.startsWith(prefix),
  );
  return matches.length
    ? matches.map((completion) => ({ value: completion, label: completion }))
    : null;
}
