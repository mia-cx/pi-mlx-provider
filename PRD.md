# Pi MLX Provider Extension PRD

## Purpose

Expose local MLX-family Hugging Face models as Pi-selectable models, with automatic runtime selection, first-run setup, server lifecycle management, and a `/mlx` control surface.

The extension should make local MLX models feel like normal Pi models while handling the messy parts: model capability detection, runtime/version compatibility, missing environments, memory pressure, and shutdown cleanup.

## Initial scope

V1 is macOS/Apple Silicon only. On other platforms, fail fast with a clear unsupported-platform message before attempting runtime installation or model startup.

Stable runtime environments for v1:

| Environment | Package | Server | Purpose |
| --- | --- | --- | --- |
| `lm` | `mlx-lm` | `python -m mlx_lm.server` | text -> text |
| `vlm` | `mlx-vlm` | `python -m mlx_vlm.server` | text/image/video/audio -> text for supported models |
| `optiq` | `mlx-optiq` | `optiq serve` | OptiQ artifacts; multimodal where supported |

Rules:

- `lm` is the universal fallback because supported models should have a text-to-text path.
- `vlm` is used for non-OptiQ multimodal models when compatible.
- `optiq` is used for OptiQ artifacts, especially multimodal OptiQ models.
- Runtime compatibility is model- and version-specific; package version is part of the requirement.
- Current package inspection shows `optiq serve` is OpenAI-compatible because it wraps/forwards to `mlx_lm.server`, while also adding Anthropic `/v1/messages` and OpenAI `/v1/responses` endpoints.
- Use thin per-runtime adapters behind one provider interface. The `lm` and `optiq` adapters can share most OpenAI-compatible request forwarding; the `vlm` adapter owns image payload formatting.

Out of v1 scope, but keep room for later:

- `omni` umbrella server / `mlx-omni-server`.
- `mlx-audio` TTS/STS.
- `mlx-whisper` and `parakeet-mlx` STT.
- Image-generation runtimes.

## Runtime API surface

Observed current server surfaces:

| Environment | Server command | Primary API | Notes |
| --- | --- | --- | --- |
| `lm` | `python -m mlx_lm.server` / `mlx_lm.server` | OpenAI-compatible `/v1/chat/completions`, `/v1/models` | Text-first baseline. |
| `vlm` | `python -m mlx_vlm.server` / `mlx_vlm.server` | FastAPI server with OpenAI-compatible and Anthropic-compatible routes | Owns image payload behavior. |
| `optiq` | `optiq serve` | OpenAI-compatible via `mlx_lm.server`; also `/v1/messages` and `/v1/responses` | Adds OptiQ KV/cache/adapter behavior and extra protocols. |

The extension should still keep per-runtime adapters. Do not assume every environment has identical CLI flags, payload formatting, readiness behavior, or future endpoint support just because all v1 environments expose OpenAI-compatible chat paths.

Implementation should start with one full vertical slice for `mlx-lm` text-to-text before adding `vlm` image handling and `optiq` behavior.

## Model identity

Pi-facing model ids:

```text
mlx/<huggingface-model-id>
```

Examples:

```text
mlx/mlx-community/Qwen2.5-VL-7B-Instruct-4bit
mlx/mlx-community/gemma-4-e2b-it-qat-OptiQ-4bit
```

Store the raw Hugging Face id separately from the Pi-facing id.

## Model requirement resolution

The extension resolves a model to a local requirement manifest.

Example manifest:

```json
{
  "schemaVersion": 1,
  "modelId": "mlx-community/gemma-4-e2b-it-4bit",
  "modelRevision": "<resolved-commit-sha>",
  "requestedRevision": "main",
  "artifactFamily": "mlx",
  "capabilities": {
    "inputs": ["text", "image", "audio"],
    "outputs": ["text"]
  },
  "preferredEnvironment": "vlm/0.4.3",
  "requirements": {
    "text-to-text": "lm/default",
    "image-text-to-text": "vlm/0.4.3"
  },
  "probeResults": {
    "vlm/0.6.3": "failed: unexpected checkpoint parameters",
    "vlm/0.4.3": "ok"
  }
}
```

Resolution inputs, in priority order:

1. User override from `/mlx`.
2. Existing cached manifest for the same Model Revision.
3. README/model-card usage snippets.
4. Artifact-family shortcuts.
5. Hugging Face metadata and small config files.
6. Runtime probes.

Manifests store the resolved Hugging Face commit SHA even when the user typed no revision or a moving branch like `main`. Revision pinning is internal in v1; commands do not expose `model@revision` syntax.

### Metadata signals grounded in observed `mlx-community/*` models

Runtime family hints:

- `lm`
  - Causal LM architecture, no multimodal processor/config.
  - README uses `mlx-lm`, e.g. `from mlx_lm import load, generate`.
  - Observed: `mlx-community/Qwen3-0.6B-4bit`.
- `vlm`
  - `vision_config`, multimodal processor, `image_processor_type`, `image-text-to-text`, `video_token_id`, etc.
  - README uses `mlx-vlm`, e.g. `python -m mlx_vlm.generate`.
  - Observed: `mlx-community/Qwen2.5-VL-3B-Instruct-4bit`, `mlx-community/Qwen2.5-VL-7B-Instruct-4bit`, `mlx-community/Mistral-Small-3.1-24B-Instruct-2503-4bit`.
- `optiq`
  - `optiq`/`OptiQ` in id, tags, README, or files.
  - Files like `optiq_metadata.json`, `optiq_vision.safetensors`.
  - README mentions `optiq serve` or `mlx-optiq`.
  - Observed: `mlx-community/gemma-4-e2b-it-qat-OptiQ-4bit`.

Version hints:

- Runtime version requirements are usually not structured HF metadata.
- Extract them from README text such as `using mlx-vlm version 0.4.3`.
- If no version hint exists, probe the installed/default runtime first.
- If latest fails and the README names a version, suggest a pinned runtime: `/mlx init vlm@0.4.3`.

Do not rely on one field. `pipeline_tag` and `library_name` are useful but not authoritative.

Observed compatibility example:

- `mlx-community/gemma-4-e2b-it-4bit`
  - Metadata says `any-to-any`, `Gemma4Processor`, `vision_config`, `audio_config`.
  - README says `mlx-vlm 0.4.3`.
  - `mlx-vlm 0.6.3` failed to load with unexpected checkpoint parameters.
  - `mlx-vlm 0.4.3` loaded and generated successfully.

## Caching requirements

Do runtime resolution once per model revision, then reuse it.

Store manifests outside the Hugging Face model cache:

```text
~/.pi/agent/extensions/mlx/models/<safe-model-id>/<revision>/manifest.json
~/.pi/agent/extensions/mlx/runtime-cache.json
```

Cache keys:

```text
manifest: (modelId, modelRevision)
probe: (modelId, modelRevision, environment, packageVersion)
```

Recompute only when:

- model revision changes;
- runtime package version changes;
- manifest schema changes;
- user explicitly refreshes/reprobes;
- referenced runtime venv no longer exists.

## Runtime installation

Product runtime uses extension-managed virtualenvs, not `uvx`.

`uvx` is acceptable for diagnostics and development probes only. It is not the product runtime because it can re-resolve packages, hide version drift, slow startup, and complicate lifecycle management.

Use one venv per Runtime Environment version, not per model:

```text
~/.pi/agent/extensions/mlx/environments/lm/default/.venv
~/.pi/agent/extensions/mlx/environments/vlm/default/.venv
~/.pi/agent/extensions/mlx/environments/vlm/0.4.3/.venv
~/.pi/agent/extensions/mlx/environments/optiq/default/.venv
~/.pi/agent/extensions/mlx/environment.json
```

Models share the same Runtime Environment when compatible. Per-model data belongs in manifests and probe caches, not in separate venvs.

`default` is a moving version alias resolved at install time and recorded as the concrete installed package version. Probe keys and compatibility checks use the resolved package version, not the word `default`. Re-running `/mlx init <environment> --force` may refresh the default environment to a newer package version.

Install examples:

```bash
uv venv ~/.pi/agent/extensions/mlx/environments/vlm/default/.venv
uv pip install --python ~/.pi/agent/extensions/mlx/environments/vlm/default/.venv/bin/python mlx-vlm

uv venv ~/.pi/agent/extensions/mlx/environments/vlm/0.4.3/.venv
uv pip install --python ~/.pi/agent/extensions/mlx/environments/vlm/0.4.3/.venv/bin/python 'mlx-vlm==0.4.3'
```

Installation must never mutate the user's global Python.

## Runtime selection

For model selection:

1. Resolve model manifest.
2. Choose the Preferred Runtime Environment.
3. If the preferred environment is missing, block selection by default and show the exact init command.
4. Offer one-click text-only fallback through `lm` when possible.
5. Text-only fallback is scoped to the current model selection/session. It is not per request and does not persist across future model switches.
6. Users may override the preferred environment to `lm` when they want permanent text-only behavior.

For each request:

1. Inspect request text for file paths and infer a Request Shape.
2. Convert supported Attachment Paths into model-native multimodal inputs when the active environment supports them.
3. If the active environment does not support an Attachment Path, keep the original path in the request body and add a warning header above the input.
4. If the extension cannot determine a runtime for model selection, use the manual repair path.

Warning example:

```text
This model's preferred environment is vlm/0.4.3.
Run: /mlx init vlm@0.4.3

Options: Run Init · Use text-only via lm · Cancel
```

Manual repair path:

```text
Could not automatically figure out what runtime is needed for mlx-community/example-model.
Check the model card: https://huggingface.co/mlx-community/example-model
If you find the required runtime there or elsewhere, configure it with:
/mlx runtime set mlx-community/example-model vlm@0.4.3

Options: Configure runtime · Use text-only via lm · Cancel
```

Manual runtime settings are stored as per-model overrides and bypass automatic runtime-family detection, but probes still validate the configured runtime before use.

## Request adaptation

Pi does not provide a special attachment system for this extension. Users may include file paths in the request text.

The extension should:

- Detect Attachment Paths conservatively.
- Treat a string as an Attachment Path only when it is an absolute path, a `~/...` path, or a clearly relative path with a file extension, and the file exists.
- Resolve relative Attachment Paths against the Pi session/project current working directory, never the extension storage directory.
- Ignore path-like strings inside code blocks.
- Do not treat arbitrary words like `foo.png` as attachments unless the file exists relative to the Pi session/project current working directory.
- In v1, only convert image Attachment Paths: `.png`, `.jpg`, `.jpeg`, and `.webp`.
- Leave audio/video/document paths as text and add a warning header until their runtime payload formats are verified.
- Classify supported image files by extension and/or MIME sniffing.
- Convert supported image Attachment Paths into the active runtime's expected multimodal payload format.
- Support multiple image attachments when the active runtime accepts them.
- Hardcode a v1 cap of at most `4` converted images per request. If more are detected, attach the first `4`, leave the rest as original path text, and inject a warning header listing skipped files.
- Replace converted path text with a short marker using the filename only, e.g. `[attached image: cat.png]`, because the actual image/audio bytes are carried in the multimodal payload. If multiple attachments share a filename in the same request, add the shortest distinguishing parent path.
- Preserve unsupported Attachment Paths as ordinary text in the request body.
- If the active environment cannot process a supported image Attachment Path, leave the original path text untouched and add a warning header above the input. Do not replace it with an attachment marker unless a multimodal payload is actually attached.
- Add a warning header above the input when paths are preserved because the active environment cannot process them.
- Inject the warning header into the prompt sent to the model unless Pi provides a reliable separate UI warning surface for provider-transformed input.

Warning example injected above the user input:

```text
[MLX warning: this model is running via lm/default, so image file paths were left as text. Use /mlx init vlm@0.4.3 and switch to the preferred environment for image understanding.]

User input follows...
```

The extension should not fail solely because a request contains an unsupported Attachment Path. The model may respond that it cannot process the path.

Attachment Path detection/conversion happens at request time in v1. Live validation while the user is composing a prompt would be a nice UX improvement, but is out of scope for this extension unless Pi exposes a prompt-composition hook later.

## User experience

### Model picker

When selecting an `mlx/...` model through Pi model selection:

1. Only Cached Models are selectable; Pi model selection does not provide arbitrary Hugging Face id entry.
2. Build/load the selected model's manifest.
3. Resolve the Preferred Runtime Environment.
4. If the Preferred Runtime Environment is missing, show a one-click yes/no environment install confirmation.
5. Start or switch the preferred runtime when the model is cached and the environment is available.

After `/mlx init <model-id>` successfully downloads weights and writes the manifest, refresh the provider model list so the model appears in `/model` without restarting Pi.

Switching away from an MLX model does not stop the server during the session. Pi shutdown stops extension-owned processes.

### Model downloads

Pi model selection and completions list MLX-family Cached Models already present on disk. Users may still type arbitrary Hugging Face model ids in `/mlx` commands and dialog fields.

Model Weight Downloads use the normal Hugging Face cache, not extension storage. The extension stores manifests, config, and logs only.

Manifest resolution may fetch small metadata, config, and README/model-card files. It must not download model weights without explicit confirmation.

Private or gated Hugging Face models are supported in v1 only through existing local Hugging Face credentials, such as `huggingface-cli login` or standard Hugging Face environment variables. The extension does not provide token management UI in v1.

When an initialized or started model is not already cached locally, prompt immediately with a combined plan. The confirmation should show the model id, approximate download size when available, target Hugging Face cache location, the Preferred Runtime Environment that will be used when known, any missing environment setup needed before use, and disk/network cost estimates where available.

Before any Model Weight Download, fetch small remote metadata, config, and README/model-card files where available. If the Preferred Runtime Environment still cannot be resolved from that metadata before download, show the model-card/manual repair path first and offer explicit `Download and probe` confirmation.

`Download and probe` should list metadata-ranked candidate Runtime Environments in the confirmation plan: OptiQ first when OptiQ signals are present, VLM when multimodal/vision signals are present, and LM as text fallback. Do not brute-force every known version. If confirmed, download the model weights, run compatibility probes against the listed candidates, then install/start only after a compatible environment is found or configured.

If local files after download reveal a new pinned Runtime Environment version that was not present in the remote metadata/README plan, ask with a lightweight one-click yes/no confirmation before installing that pinned environment.

Triggers that show this prompt:

- running `/mlx init <model-id>` for an uncached model;
- running `/mlx start <model-id>` for an uncached model.

Uncached models are not selectable through Pi model selection, so download/setup work from `/mlx` leaves Pi using whatever model was previously selected until preparation completes.

If the user confirms, start the download immediately and perform the listed environment setup. Show download progress as user-visible UI in the prompt header and in the `/mlx` dialog/status; never inject progress text into model prompts. If the user declines, do not download weights, install the environment, or start the model. For cached models with missing environments, ask for a lightweight one-click yes/no package-install confirmation before installing.

If Model Weight Download fails because the model is private, gated, or unauthenticated, show the model-card link and suggest `huggingface-cli login` or requesting model access. If a download fails or is cancelled, leave partial cache cleanup to Hugging Face tooling; the extension must not delete from the shared Hugging Face cache.

### `/mlx` dialog

`/mlx` opens a dialog showing:

- Server status: `stopped`, `starting`, `running`, `switching`, `stopping`, `error`.
- Active model id, manifest summary, selected runtime, endpoint URL, PID, last error.
- Installed runtime environments and versions.
- Missing runtime requirements for the selected model.
- Cached Models already present on disk, annotated with artifact family/capabilities.
- Text input for any Hugging Face model id.
- Per-model override: `auto`, `lm`, `vlm`, `optiq`, or versioned runtime like `vlm/0.4.3`.
- Manual repair instructions when runtime detection fails, including a Hugging Face model-card link and copyable `/mlx runtime set ...` command.
- Max concurrent model memory.
- Max concurrent resident model count.
- Buttons: Start, Stop, Refresh models, Reprobe, Init, Save settings.

### Slash commands

```text
/mlx
/mlx status
/mlx init [environment[@version]|model-id|--all] [--force]
/mlx start [model-id]
/mlx stop
/mlx logs
/mlx reprobe <model-id>
/mlx runtime set <model-id> <environment[@version]>
/mlx max memory <memory-amount>
/mlx max models <model-count>
/mlx max context <tokens|auto>
/mlx max tokens <tokens|auto>
```

Behavior:

- `/mlx init lm|vlm|optiq` shows a one-click yes/no confirmation, then installs/verifies the default version of one stable environment.
- `/mlx init vlm@0.4.3` shows a one-click yes/no confirmation, then installs/verifies a pinned runtime version.
- `/mlx init <model-id>` resolves the model manifest, applies per-model overrides, and if the model is uncached, shows one combined confirmation plan covering Model Weight Download plus any missing Preferred Runtime Environment setup. If the model is already cached locally, it shows a one-click yes/no confirmation for missing environment install, then installs/verifies the selected Preferred Runtime Environment. `init` prepares the model only; it does not start a Runtime Server.
- `/mlx init --all` scans MLX-family Cached Models already present on disk, resolves their manifests, applies per-model overrides, shows an install plan with disk/network cost estimates where available, asks for confirmation, then installs/verifies each resolvable model's selected Preferred Runtime Environment only. Models whose environments cannot be resolved do not block installation; list them at the end with model-card links and manual repair commands. It never downloads model weights.
- `/mlx` is an alias for `/mlx status` and shows current Runtime Server, download, manifest, environment, and diagnostic state.
- Selecting an MLX model with `/model` starts or switches the needed Runtime Server automatically.
- `/mlx start <model-id>` is primarily for prewarming: it behaves like model setup for uncached models, downloads weights if confirmed, performs missing environment setup, then starts the resolved Runtime Server without switching Pi's selected `/model`.
- `/mlx start` without a model id starts the currently selected MLX model if needed; if the selected model is not MLX, show `select an MLX model or pass a model id`.
- `/mlx stop` stops all extension-owned Runtime Servers only. It does not cancel Model Weight Downloads; download cancellation is deferred to v2.
- `/mlx logs` shows a short runtime log tail for the active/prewarmed Runtime Server. Full logs remain file-based and are not streamed into chat unless requested. Log output shown in chat/dialog is redacted for common token patterns and known secret environment values.
- `/mlx reprobe <model-id>` refreshes compatibility probes for a cached model after package, model, or manifest changes. If the model is uncached, show `run /mlx init <model-id> first`. Keep probe history while marking the latest result for each environment/version.
- `/mlx runtime set <model-id> <environment[@version]|auto>` stores a manual per-model Preferred Runtime Environment override, e.g. `/mlx runtime set mlx-community/example-model vlm@0.4.3`. It changes the model-switch default; it does not create hidden per-request rerouting.
- `/mlx runtime set <model-id> auto` clears the per-model override and restores manifest-driven Preferred Runtime Environment resolution.
- Override inputs accept user-friendly `environment@version` and canonical `environment/version`; store only canonical `environment/version` internally.
- Override inputs without a version mean `default`, e.g. `vlm` stores as `vlm/default`.
- If an override probes as incompatible, save it but mark it invalid and show `configured but currently failing`; do not silently use a failing override.
- `/mlx max memory <amount>` updates the memory overlap cap.
- `/mlx max models <count>` updates the resident-model cap.
- `/mlx max context <tokens|auto>` updates the provider context window and refreshes the provider registration.
- `/mlx max tokens <tokens|auto>` updates the provider max output tokens (`maxTokens`) so reasoning traces and long tool-call loops have enough generation budget. `auto` omits a separate cap and follows the active context window size.

Completion behavior:

- Pi only shows next-level command suggestions after a space following the current command/subcommand.
- Therefore every non-terminal completion inserted by this extension must include a trailing space, e.g. accepting `init` inserts `/mlx init `, not `/mlx init`.
- Completion state should also normalize an exact token at cursor as if it had a trailing space when that token is a known non-terminal command. This covers clients that tab-complete without inserting the space.
- Suggestions must be defined for each command depth:
  - after `/mlx `: `init`, `start`, `stop`, `runtime`, `max`;
  - after `/mlx init `: `lm`, `vlm`, `optiq`, `--all`, cached model ids;
  - after `/mlx runtime `: `set`;
  - after `/mlx runtime set `: cached/known model ids;
  - after `/mlx runtime set <model-id> `: `lm`, `vlm`, `optiq`, and installed/pinned versions;
  - after `/mlx max `: `memory`, `models`, `context`, `tokens`.
- Terminal value completions should not add a trailing space unless another argument is expected.

## Server lifecycle

Start triggers:

- User selects an MLX-owned model.
- User clicks Start in `/mlx`.
- User runs `/mlx start`.

Stop triggers:

- Pi shutdown.
- User clicks Stop in `/mlx`.
- User runs `/mlx stop`.

Rules:

- Stop only processes started by this extension.
- Bind to `127.0.0.1` by default.
- Spawn with argument arrays, not shell strings.
- If the same runtime/version already serves the requested model, reuse it.
- If compatible runtime supports in-process model switching, switch in process.
- If runtime/version changes, stop/unload the old extension-owned process as needed, then start the new one.

Readiness checks, in order:

1. Runtime-specific health endpoint.
2. `GET /v1/models` if OpenAI-compatible.
3. Minimal non-streaming `POST /v1/chat/completions`.

Shutdown:

1. SIGTERM.
2. Wait configured grace period.
3. SIGKILL only if needed.
4. Clear runtime PID after exit is confirmed.

## Model switching and memory caps

Configurable caps:

- `maxConcurrentModelMemoryBytes`
- `maxConcurrentModels`

Default: `maxConcurrentModels = 1`, so v1 serves only one active model per Runtime Server and unloads before load.

Switch flow within a compatible runtime:

1. Enter `switching`.
2. Reject or queue new requests according to Pi provider expectations.
3. Estimate `currentModelMemory + newModelMemory + switchOverhead`.
4. If either cap would be exceeded, unload old model first.
5. Load new model.
6. If old model remained resident, unload it immediately after new model readiness.
7. Confirm active model changed before accepting requests.

If memory cannot be estimated, assume overlap exceeds the cap.

## Configuration

Durable config:

```json
{
  "defaultModelId": "mlx-community/Qwen2.5-VL-7B-Instruct-4bit",
  "host": "127.0.0.1",
  "port": 8080,
  "runtimeMode": "auto",
  "maxConcurrentModelMemoryBytes": 12884901888,
  "maxConcurrentModels": 1,
  "startupTimeoutMs": 120000,
  "shutdownTimeoutMs": 5000,
  "environmentOverrides": {
    "mlx-community/gemma-4-e2b-it-qat-OptiQ-4bit": "optiq/default",
    "mlx-community/gemma-4-e2b-it-4bit": "vlm/0.4.3"
  },
  "invalidEnvironmentOverrides": {
    "mlx-community/example-model": {
      "environment": "vlm/0.4.3",
      "reason": "probe failed: unexpected checkpoint parameters"
    }
  }
}
```

Ephemeral runtime state:

```json
{
  "status": "running",
  "modelId": "mlx-community/gemma-4-e2b-it-4bit",
  "environment": "vlm/0.4.3",
  "pid": 12345,
  "baseUrl": "http://127.0.0.1:8080/v1",
  "startedAt": "2026-06-24T00:00:00.000Z",
  "lastError": null,
  "prewarmed": false
}
```

A Runtime Server started by `/mlx start <model-id>` may be running even when Pi's selected `/model` is still different. Show that server as `prewarmed` in `/mlx` until the user switches with `/model`. Prewarmed Runtime Servers do not receive requests before the user switches `/model`. Prewarming may survive switching to a non-MLX model unless memory or resident-model caps require stopping it. Selecting a different MLX model replaces the prewarmed server in v1. Stop a prewarmed server automatically if keeping it would violate memory or resident-model caps.

Download state is separate from Runtime Server state:

```json
{
  "downloadStatus": "idle",
  "modelId": null,
  "progress": null,
  "lastError": null
}
```

Download status values: `idle`, `planning`, `downloading`, `failed`, `complete`.

## Cached model discovery

Scan:

- `$HF_HOME/hub`
- `$HUGGINGFACE_HUB_CACHE`
- `~/.cache/huggingface/hub`

Convert:

```text
models--org--repo -> org/repo
```

Only expose MLX-family Cached Models. If detection is incomplete, show the model only when local signals still indicate MLX-family compatibility.

## Logging and diagnostics

Capture runtime stdout/stderr to extension logs.

Show in `/mlx`:

- Last error.
- Short log tail.
- Manifest source.
- Probe failures by model/runtime/version.
- Unresolved Cached Models from the last `/mlx init --all` as a compact `needs manual repair` section with model-card links.

Do not stream full logs into chat unless requested.

## Security and safety

- Never execute model ids through shell interpolation.
- Validate Hugging Face ids before passing them as arguments.
- Reject empty ids, control characters, and shell metacharacters.
- Install only into extension-owned paths.
- Ask before installing packages, using a lightweight one-click yes/no confirmation for runtime-only installs.
- Stop only extension-owned PIDs.

## Acceptance criteria

- MLX-owned models appear as `mlx/<huggingface-model-id>`.
- Pi model selection exposes only MLX-family Cached Models; arbitrary Hugging Face ids are entered through `/mlx` commands or dialog fields.
- Selecting a model resolves or loads its cached manifest before switching.
- First model selection/init resolves runtime requirements and stores them outside the HF cache.
- Model Manifests are keyed by resolved Hugging Face commit SHA.
- Model Weight Downloads use the normal Hugging Face cache and never happen without explicit confirmation.
- Later starts reuse cached requirements unless invalidated.
- Missing runtime warnings show exact commands like `/mlx init vlm@0.4.3`.
- Unknown-runtime failures show a Hugging Face model-card link and a copyable manual override command like `/mlx runtime set <model-id> vlm@0.4.3`.
- `/mlx init <model-id>` shows one combined confirmation plan for uncached models; if declined, it does not download weights or install environments; if accepted, it prepares the model without starting a Runtime Server and refreshes `/model` availability when complete.
- Selecting an MLX model through `/model` starts or switches the Runtime Server automatically.
- `/mlx start <model-id>` follows the same confirmation/download/setup flow as model setup, then prewarms the Runtime Server without switching Pi's selected `/model`.
- `/mlx` and `/mlx status` show current Runtime Server, download, manifest, environment, and diagnostic state. `/mlx` opens the dialog when UI is available and otherwise prints text; `/mlx status` always prints concise text and may also update dialog state.
- `/mlx init --all` scans MLX-family Cached Models and installs/verifies selected Preferred Runtime Environments only after showing a confirmation plan with cost estimates where available; it never downloads model weights.
- `lm` is offered as text-only fallback when multimodal runtime is missing/incompatible.
- OptiQ models are detected from `optiq` id/tags/files/README and route through the `optiq` adapter/server command.
- Runtime probe cache includes package version.
- Manual runtime overrides are stored per model and still validated by runtime probes before use.
- Different models can use different installed versions of the same runtime.
- `/mlx start`, `/mlx stop`, `/mlx logs`, `/mlx reprobe`, `/mlx max memory`, and `/mlx max models` work and update dialog state.
- Runtime log output shown in chat/dialog redacts common token patterns and known secret environment values.
- Tab-completing `/mlx init` immediately exposes `init` argument suggestions without requiring the user to type an extra space manually.
- Non-terminal slash command completions insert or emulate a trailing space so nested suggestions remain visible after Tab completion.
- Model switching obeys memory and resident-model caps.
- Pi shutdown stops extension-owned processes.
- User-managed runtime processes are never killed or mutated.

## V2 backlog

- `/mlx download ...` subcommands, including cancellation.
- `/mlx cleanup` for stale pinned Runtime Environments and other extension-owned storage.

## Open questions

1. What Pi APIs provide model registration, model-selection warnings, slash command dialogs, and shutdown hooks?
2. Does Pi provide an OpenAI-compatible local endpoint adapter, or do we implement the HTTP forwarding ourselves?
