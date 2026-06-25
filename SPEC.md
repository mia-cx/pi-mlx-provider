# Pi MLX Provider Extension Technical Spec

This spec derives from `PRD.md`. It defines the TypeScript package shape and the responsibilities of each module. Product decisions live in `PRD.md`; implementation contracts live here.

## Architecture goals

- Keep Pi SDK integration thin and isolated.
- Keep runtime/model logic pure and testable.
- Treat runtime version as part of model compatibility.
- Support macOS/Apple Silicon only in v1 and fail fast elsewhere.
- Keep Python runtime installation/lifecycle separate from slash-command parsing.
- Use thin per-runtime adapters behind one provider interface so OpenAI-compatible forwarding can be shared without assuming identical CLI flags, payload formatting, or readiness behavior.
- Make command completions reliable after Tab completion by inserting/emulating trailing spaces for non-terminal commands.

## Package shape

```text
pi-mlx-provider/
  PRD.md
  SPEC.md
  package.json
  pnpm-lock.yaml
  tsconfig.json
  biome.json
  vitest.config.ts

  src/
    index.ts

    pi/
      register.ts
      model-provider.ts
      slash-command.ts
      completions.ts
      dialog.ts
      lifecycle.ts

    commands/
      parse.ts
      handlers.ts
      completion-tree.ts

    models/
      model-id.ts
      cached-models.ts
      hf-metadata.ts
      model-download.ts
      manifest.ts
      manifest-resolver.ts
      probe-cache.ts

    runtimes/
      registry.ts
      environment-manager.ts
      runtime-selector.ts
      process-manager.ts
      server-manager.ts
      probes.ts

    provider/
      runtime-adapter.ts
      lm-adapter.ts
      vlm-adapter.ts
      optiq-adapter.ts
      openai-compatible.ts
      request-shape.ts
      attachment-paths.ts

    storage/
      paths.ts
      config-store.ts
      manifest-store.ts
      runtime-cache-store.ts
      logs.ts

    ui/
      status-view-model.ts
      messages.ts

    utils/
      sizes.ts
      spawn.ts
      validation.ts

  test/
    commands/
      completions.test.ts
      parse.test.ts
    models/
      model-id.test.ts
    runtimes/
      runtime-selector.test.ts
    utils/
      sizes.test.ts
```

## Module responsibilities

### `src/index.ts`

Extension entrypoint. It should only compose services and register with Pi.

Responsibilities:

- Create the service graph.
- Call `registerPiSurface`.
- Export the default Pi extension function.

Non-responsibilities:

- No parsing.
- No runtime installation.
- No Hugging Face metadata logic.

### `src/pi/*`

Pi SDK boundary. Everything here may know Pi API shapes; almost nothing else should.

- `register.ts`
  - Registers model provider, slash command, completions, dialog hooks, and lifecycle hooks.
  - Owns defensive compatibility checks around Pi SDK API differences.
- `model-provider.ts`
  - Exposes only MLX-family Cached Models as `mlx/<huggingface-model-id>` models to Pi.
  - Converts Pi requests into provider request shapes.
  - Delegates runtime selection/start to `runtimes/server-manager.ts`.
  - Prompts with a lightweight one-click yes/no confirmation before installing a missing environment for a cached selected model.
- `slash-command.ts`
  - Pi-facing `/mlx` command handler.
  - Delegates parsing to `commands/parse.ts` and execution to `commands/handlers.ts`.
- `completions.ts`
  - Pi-facing completion adapter.
  - Applies the trailing-space workaround for nested suggestions.
- `dialog.ts`
  - Builds `/mlx` dialog view models and maps button actions to command handlers.
  - Shows Model Weight Download state separately from Runtime Server state.
- `lifecycle.ts`
  - Stops extension-owned runtime processes on Pi shutdown/session end.

### `src/commands/*`

Slash-command grammar and behavior, independent of Pi UI.

- `parse.ts`
  - Parses `/mlx` command strings into typed command objects.
  - Accepts user-friendly `environment@version` and canonical `environment/version` runtime ids.
  - Treats unversioned `lm`, `vlm`, and `optiq` as `default`.
  - Validates obvious syntax only; semantic validation belongs in handlers.
- `handlers.ts`
  - Implements `status`, `init`, `start`, `stop`, `logs`, `reprobe`, `runtime set`, and `max` command behavior.
  - Treats `/mlx` as an alias for `/mlx status`.
  - Implements `/mlx logs` as a short runtime log tail for the active/prewarmed Runtime Server only.
  - Implements `/mlx reprobe <model-id>` to refresh model/runtime compatibility probes for cached models after package, model, or manifest changes; uncached models are told to run `/mlx init <model-id>` first.
  - For `/mlx init lm|vlm|optiq` and `/mlx init environment@version`, shows a one-click yes/no confirmation before installing packages.
  - Accepts arbitrary typed Hugging Face ids for `/mlx init <model-id>` and `/mlx start <model-id>`.
  - For `/mlx init <model-id>`, resolves the manifest, applies any per-model override, and when the model is uncached shows one combined confirmation plan covering Model Weight Download plus missing Preferred Runtime Environment setup.
  - If the user declines the combined plan, does not download weights, install the environment, or start the model.
  - For `/mlx init <model-id>`, prepares only; it does not start a Runtime Server after install/download.
  - Refreshes the provider model list after successful download/manifest write so the model appears in `/model` without restarting Pi.
  - Selecting an MLX model through `/model` starts or switches the Runtime Server automatically.
  - For `/mlx start <model-id>`, follows the same confirmation/download/setup flow, then prewarms the Runtime Server without switching Pi's selected `/model`.
  - For `/mlx start` without a model id, starts the currently selected MLX model if needed; if the selected model is not MLX, returns `select an MLX model or pass a model id`.
  - For cached models, shows a one-click yes/no confirmation before installing a missing Preferred Runtime Environment.
  - For `/mlx init --all`, scans MLX-family Cached Models already present on disk, resolves manifests, applies per-model overrides, shows an install plan with disk/network cost estimates where available, asks for confirmation, then installs/verifies each resolvable model's selected Preferred Runtime Environment only.
  - `/mlx init --all` never downloads model weights.
  - Lists unresolved Cached Models after installation with model-card links and manual repair commands instead of blocking the whole plan.
  - If an uncached model's Preferred Runtime Environment cannot be resolved from remote metadata/config/README, shows the manual repair path and offers explicit `Download and probe`.
  - `Download and probe` lists metadata-ranked candidate environments in the confirmation plan: OptiQ first for OptiQ signals, VLM for multimodal/vision signals, and LM as text fallback.
  - After download, runs probes against listed candidates before installing/starting an environment; if local files reveal a new pinned version not in the plan, asks with a lightweight one-click yes/no confirmation before installing it.
  - Calls storage/runtime/model services.
- `completion-tree.ts`
  - Defines completion grammar.
  - Non-terminal suggestions include trailing spaces.
  - Exact known non-terminal tokens at cursor are treated as if they had a trailing space.

### `src/models/*`

Model discovery, identity, metadata, manifests, and probe cache.

- `model-id.ts`
  - Parses and formats `mlx/<hf-id>` and raw Hugging Face ids.
  - Produces safe filesystem ids.
- `cached-models.ts`
  - Scans Hugging Face cache roots for Cached Models already present on disk without downloading model weights.
  - Filters to MLX-family candidates only; non-MLX cached Hugging Face models are not exposed through Pi model selection.
  - Distinguishes Cached Models from cached Model Manifests.
  - Reports whether a typed model id already has local weights.
- `hf-metadata.ts`
  - Fetches small HF metadata/config/README files only.
  - Must not download weight files.
  - Resolves the immutable Hugging Face commit SHA for manifest cache identity.
  - Provides approximate model snapshot size when available for Model Weight Download prompts.
- `model-download.ts`
  - Downloads model weights into the normal Hugging Face cache after explicit user confirmation.
  - Starts confirmed downloads immediately and exposes user-visible progress events for prompt-header and `/mlx` dialog/status surfaces.
  - Keeps download progress out of model prompts.
  - Uses existing local Hugging Face credentials only; no token management UI in v1.
  - Surfaces private/gated/auth failures with the model-card link plus `huggingface-cli login` or access-request guidance.
  - Leaves failed/cancelled partial-cache cleanup to Hugging Face tooling and never deletes from the shared Hugging Face cache.
- `manifest.ts`
  - Owns manifest types and schema version.
  - Stores both requested revision, when known, and resolved commit SHA.
- `manifest-resolver.ts`
  - Converts metadata/README/probe results into runtime requirements.
  - Checks remote README/model-card metadata before any Model Weight Download when available.
  - Detects OptiQ from `optiq` in id/tags/files/README.
  - Extracts runtime version hints from README text.
  - Ranks candidate Runtime Environments for probes without brute-forcing every known version.
- `probe-cache.ts`
  - Stores probe results keyed by `(modelId, revision, environment, packageVersion)`.
  - Keeps probe history while marking the latest result per environment/version.

### `src/runtimes/*`

Runtime environment installation, selection, process lifecycle, probes.

- `registry.ts`
  - Declares stable runtime environments: `lm`, `vlm`, `optiq`.
  - Maps aliases and version pins to Python packages/commands.
  - Treats `default` as a moving alias resolved at install time, then recorded as the concrete installed package version.
- `environment-manager.ts`
  - Creates/verifies extension-owned venvs keyed by Runtime Environment version, not by model.
  - Reuses one venv for all compatible models.
  - Records the resolved installed package version for `default` environments.
  - Runs `uv venv` and `uv pip install` with argument arrays.
  - Never mutates global Python.
- `runtime-selector.ts`
  - Chooses `lm/default`, `vlm/default`, `vlm/<version>`, or `optiq/default` from per-model override + manifest + installed runtimes.
  - Treats `auto` as no override.
  - Does not silently use overrides marked invalid by probes.
  - Offers `lm` text-only fallback when multimodal runtime is missing/incompatible.
- `process-manager.ts`
  - Spawns/stops runtime server processes.
  - Tracks extension-owned PIDs only.
  - Captures stdout/stderr logs.
- `server-manager.ts`
  - High-level state machine: `stopped`, `starting`, `running`, `switching`, `stopping`, `error`.
  - Applies memory/model-count switching caps.
  - V1 serves only one active model per Runtime Server.
  - Marks servers started by `/mlx start <model-id>` as `prewarmed` when Pi's selected `/model` is still different.
  - Does not route requests to prewarmed servers until the user switches `/model`.
  - Allows prewarming to survive switching to a non-MLX model unless memory or resident-model caps would be violated.
  - Replaces the prewarmed server when the user selects a different MLX model in v1.
  - Stops prewarmed servers automatically when memory or resident-model caps would be violated.
  - `/mlx stop` stops all extension-owned Runtime Servers.
- `probes.ts`
  - Runs runtime compatibility probes.
  - For uncached models whose environment cannot be resolved from metadata, probes only after an explicit confirmed Model Weight Download makes the model available on disk.
  - Probes metadata-ranked candidates only; does not brute-force every known runtime version.
  - Uses installed venvs, not `uvx`, in product code.

### `src/provider/*`

Provider request/response adaptation.

- `runtime-adapter.ts`
  - Defines the adapter interface for request shaping, server command construction, readiness checks, and forwarding.
- `lm-adapter.ts`
  - Implements the `mlx-lm` text-to-text vertical slice first.
  - Uses OpenAI-compatible forwarding to `mlx_lm.server`.
- `vlm-adapter.ts`
  - Implements `mlx-vlm` forwarding and image payload formatting.
  - Treats image formatting as VLM-specific until proven identical elsewhere.
- `optiq-adapter.ts`
  - Runs `optiq serve` and shares OpenAI-compatible forwarding where possible.
  - Accounts for OptiQ-specific CLI flags and extra `/v1/messages` and `/v1/responses` support.
- `request-shape.ts`
  - Inspects request text for Attachment Paths and classifies requests, e.g. `text-to-text`, `image-text-to-text`.
- `attachment-paths.ts`
  - Detects Attachment Paths conservatively.
  - Accepts absolute paths, `~/...` paths, and clearly relative paths with file extensions only when the file exists.
  - Resolves relative paths against the Pi session/project current working directory, never extension storage.
  - Ignores path-like strings inside code blocks.
  - Does not treat arbitrary words like `foo.png` as attachments unless they exist relative to the Pi session/project current working directory.
  - In v1, only converts image Attachment Paths: `.png`, `.jpg`, `.jpeg`, and `.webp`.
  - Leaves audio/video/document paths as text and emits a warning header until their runtime payload formats are verified.
  - Classifies supported image files by extension and/or MIME sniffing.
  - Converts supported image paths into runtime-native multimodal payload parts.
  - Supports multiple images when the active runtime accepts them.
  - Applies a hardcoded v1 cap of `4` converted images; attaches the first `4`, leaves additional paths as text, and emits a warning header listing skipped files.
  - Replaces converted path text with a filename-only marker such as `[attached image: cat.png]`; if multiple attachments share a filename in one request, uses the shortest distinguishing parent path.
  - Leaves unsupported paths in the text body.
  - Leaves the original path text untouched when the active environment cannot attach the file; markers are only used when a multimodal payload is actually attached.
  - Injects warning headers into the prompt above the user input unless Pi provides a reliable separate UI warning surface for provider-transformed input.
  - Runs at request time in v1; live prompt-composition validation is out of scope unless Pi exposes a prompt-composition hook later.
- `openai-compatible.ts`
  - Forwards requests to local OpenAI-compatible endpoints.
  - Handles streaming when the runtime supports it.
  - Prepends warning text above the user input when Attachment Paths are preserved because the active environment cannot process them.

### `src/storage/*`

Extension-owned durable and ephemeral storage.

- `paths.ts`
  - Centralizes extension storage paths.
- `config-store.ts`
  - Durable user config and per-model Preferred Runtime Environment overrides.
  - Stores overrides canonically as `environment/version`.
  - Clears an override when the user sets it to `auto`.
  - Records invalid override status when a saved override probes as incompatible.
- `manifest-store.ts`
  - Cached manifests outside the HF model cache.
- `runtime-cache-store.ts`
  - Runtime/probe cache.
- `logs.ts`
  - Runtime log file paths and log tail helpers.
  - Supports `/mlx logs` short-tail output while keeping full logs file-based.
  - Redacts common token patterns and known secret environment values before log output reaches chat/dialog surfaces.

### `src/ui/*`

User-visible status and message text.

- `status-view-model.ts`
  - Builds state shown in `/mlx` dialog and `/mlx status`.
  - `/mlx` opens dialog when UI is available and otherwise prints text; `/mlx status` always prints concise text and may also update dialog state.
  - Represents Model Weight Download state separately from Runtime Server state, e.g. `idle`, `planning`, `downloading`, `failed`, `complete`.
  - Shows prewarmed Runtime Servers separately from Pi's selected `/model`.
  - Includes unresolved Cached Models from the last `/mlx init --all` as a compact `needs manual repair` section with model-card links.
- `messages.ts`
  - Owns warning/error/repair copy.
  - Includes unknown-runtime repair message with HF model-card link and `/mlx runtime set ...` command.

### `src/utils/*`

Small reusable utilities.

- `sizes.ts`
  - Parses `8GB`, `12GiB`, suffixless bytes.
- `spawn.ts`
  - Safe child-process helpers using argument arrays.
- `validation.ts`
  - Hugging Face id and runtime id validation.
  - Platform validation for v1 macOS/Apple Silicon support.

## Completion contract

Pi only shows nested suggestions after a space following the current command/subcommand. Therefore:

- Non-terminal completion values must include trailing spaces.
- Completion parsing must normalize exact known non-terminal tokens at cursor as if a trailing space exists.
- Terminal completions only include trailing spaces when another argument is expected.

Examples:

```text
/mlx <TAB>              -> init␠, start␠, stop, runtime␠, max␠
/mlx init<TAB>          -> inserts or treats as `/mlx init `, then shows lm/vlm/optiq/--all/model ids
/mlx runtime<TAB>       -> inserts or treats as `/mlx runtime `, then shows set␠
/mlx max<TAB>           -> inserts or treats as `/mlx max `, then shows memory␠, models␠
```

## Implementation order

1. Project config: TypeScript, Biome, Vitest.
2. Pure command parser and completion tree.
3. Model id + storage path helpers.
4. Platform guard: macOS/Apple Silicon only for v1.
5. Runtime registry and selector.
6. HF metadata + manifest resolver.
7. `mlx-lm` vertical slice: environment install, server start/stop/status, OpenAI-compatible forwarding for text-to-text.
8. Pi slash command/dialog integration for the `mlx-lm` slice.
9. Pi model provider integration for cached `mlx-lm` models.
10. Probes, lifecycle cleanup, and memory-cap switching.
11. Add `mlx-vlm` image request adaptation.
12. Add `mlx-optiq` adapter/server behavior.
