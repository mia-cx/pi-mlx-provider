# pi-mlx-provider

Pi package for running local MLX-family Hugging Face models through Pi's extension/provider API.

## Use locally

```bash
pnpm install
pi -e . --list-models
pi -e .
```

Pi loads `./src/index.ts` directly through its extension loader, so a build is only needed when publishing/consuming the package as plain JS.

Inside Pi:

```text
/mlx
/mlx status
/mlx init lm
/mlx context 128k
/mlx max tokens 16k
/model mlx/<huggingface-model-id>
/mlx start <huggingface-model-id>
/mlx logs
/mlx stop
```

The extension registers provider `mlx` with cached MLX-family models found in the Hugging Face cache (`$HF_HUB_CACHE` or `~/.cache/huggingface/hub`). Selecting an `mlx/...` model starts an extension-managed `mlx-lm` server on `127.0.0.1:11439` and routes Pi through OpenAI-compatible chat completions.

Runtime environments are installed into `~/.pi/agent/mlx-provider/environments/<runtime>/<version>/.venv` after confirmation.

`/mlx` opens an interactive dialog when UI is available. The extension also keeps an MLX widget above the prompt editor with the loaded model, server state, activity, configured context window, and max output tokens. Context window and max output token settings persist in `~/.pi/agent/mlx-provider/config.json`; by default max output tokens follows the active context window. Use `/mlx context auto` and `/mlx max tokens auto` to reset to defaults.

Known reasoning-capable local model families such as Qwen3, QwQ, DeepSeek-R1, and GPT-OSS are registered with Pi reasoning support enabled.
