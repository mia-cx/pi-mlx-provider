# pi-mlx-provider

Run local MLX-family Hugging Face models from Pi through Pi's extension/provider API.

The extension registers a `mlx` model provider, discovers cached Hugging Face models, starts an extension-managed `mlx-lm` server on demand, and forwards Pi requests through OpenAI-compatible chat completions.

## Requirements

- Pi coding agent with package installation support.
- macOS on Apple Silicon for MLX runtime support.
- Node.js 20 or newer.
- Hugging Face models available in `$HF_HUB_CACHE` or `~/.cache/huggingface/hub`.

Runtime environments are installed under `~/.pi/agent/mlx-provider/environments/<runtime>/<version>/.venv` after confirmation.

## Install

Install from this git repository:

```bash
pi install git:https://github.com/mia-cx/pi-mlx-provider.git
```

Then start Pi normally:

```bash
pi
```

## Quick start

Inside Pi:

```text
/mlx init lm
/mlx init --all
/model mlx/<huggingface-model-id>
```

Selecting an `mlx/...` model starts the local runtime automatically. You can also prewarm a model explicitly:

```text
/mlx start <huggingface-model-id>
```

Example:

```text
/mlx init lm
/model mlx/mlx-community/Qwen3-8B-4bit
/mlx start mlx-community/Qwen3-8B-4bit
```

## Command reference

### Status and UI

| Command | Description |
| --- | --- |
| `/mlx` | Open the MLX control dialog when UI is available; otherwise show status. |
| `/mlx status` | Show server state, active model, activity, context window, max output tokens, and cached model count. |
| `/mlx logs` | Show the active runtime log tail. |

### Runtime setup

| Command | Description |
| --- | --- |
| `/mlx init lm` | Install the default `mlx-lm` runtime environment. |
| `/mlx init <runtime>` | Install a runtime environment. Supported runtimes: `lm`, `vlm`, `optiq`. |
| `/mlx init <runtime>/<version>` | Install a named runtime version. `@` also works, e.g. `lm@default`. |
| `/mlx init <model-id>` | Ensure the default `lm` environment exists, then refresh cached model registration for the model id. |
| `/mlx init --all` | Refresh the provider from the Hugging Face cache and report discovered cached MLX models. |

### Model lifecycle

| Command | Description |
| --- | --- |
| `/model mlx/<huggingface-model-id>` | Select a local MLX model through Pi's normal model picker command. |
| `/mlx start [huggingface-model-id]` | Start/prewarm the local runtime server for a model. If omitted, uses the selected `mlx` model. |
| `/mlx stop` | Stop all extension-managed MLX runtime processes. |
| `/mlx reprobe <huggingface-model-id>` | No-op compatibility command; server startup already verifies runtime readiness. |

### Context and output limits

Token values accept plain numbers or suffixes such as `32k`, `128k`, or `1m`.

| Command | Description |
| --- | --- |
| `/mlx context` | Show the current context window. |
| `/mlx context <tokens>` | Set the provider context window. Minimum: `4096`. |
| `/mlx context auto` | Reset context window to the default. `default` is also accepted. |
| `/mlx tokens` | Show the current max output token limit. |
| `/mlx tokens <tokens>` | Set max output tokens. |
| `/mlx tokens auto` | Reset max output tokens to follow the context window. `default` and `context` are also accepted. |
| `/mlx max context <tokens\|auto>` | Alias for `/mlx context <tokens\|auto>`. |
| `/mlx max tokens <tokens\|auto>` | Alias for `/mlx tokens <tokens\|auto>`. |
| `/mlx max output <tokens\|auto>` | Alias for `/mlx max tokens <tokens\|auto>`. |
| `/mlx max-tokens <tokens\|auto>` | Alias for `/mlx tokens <tokens\|auto>`. |

`/mlx max memory <amount>` and `/mlx max models <count>` are parsed but not wired yet.

During runtime installs and model downloads, the sticky MLX prompt header shows the active operation plus a slowly filling progress bar so long-running setup does not look stuck.

## How model discovery works

The provider lists MLX-family models found in the Hugging Face cache:

- `$HF_HUB_CACHE`, when set
- `~/.cache/huggingface/hub`, by default

Pi sees discovered models as `mlx/<huggingface-model-id>`. Known reasoning-capable local model families such as Qwen3, QwQ, DeepSeek-R1, and GPT-OSS are registered with Pi reasoning support enabled.

## Local development

```bash
pnpm install
pnpm check
pi -e . --list-models
pi -e .
```

Pi loads `./src/index.ts` directly through its extension loader during local development. Build output is only needed when consuming the package as plain JavaScript:

```bash
pnpm build
```

## Persistent state

The extension stores configuration and runtime state under `~/.pi/agent/mlx-provider/`:

- `config.json` stores context window and max output token settings.
- `environments/` stores extension-managed Python virtual environments.
- runtime logs are tailed by `/mlx logs`.
