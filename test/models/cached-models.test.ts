import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeCachedModelsWithKnownIds,
  scanCachedModels,
} from "../../src/models/cached-models";

describe("scanCachedModels", () => {
  it("returns only MLX-family Hugging Face snapshots already on disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "mlx-cache-"));
    await mkdir(
      join(root, "models--mlx-community--Qwen2.5-7B-4bit", "snapshots", "abc"),
      { recursive: true },
    );
    await mkdir(join(root, "models--openai--clip-vit", "snapshots", "def"), {
      recursive: true,
    });
    await mkdir(join(root, "models--org--local-mlx", "snapshots", "ghi"), {
      recursive: true,
    });
    await writeFile(
      join(root, "models--org--local-mlx", "README.md"),
      "Run with mlx-lm.",
    );

    await expect(scanCachedModels({ cacheRoots: [root] })).resolves.toEqual([
      {
        modelId: "mlx-community/Qwen2.5-7B-4bit",
        revision: "abc",
        cachePath: join(root, "models--mlx-community--Qwen2.5-7B-4bit"),
      },
      {
        modelId: "org/local-mlx",
        revision: "ghi",
        cachePath: join(root, "models--org--local-mlx"),
      },
    ]);
  });

  it("keeps just-downloaded model ids visible even before scanning catches up", () => {
    expect(
      mergeCachedModelsWithKnownIds(
        [
          {
            modelId: "mlx-community/cached",
            revision: "abc",
            cachePath: "/cache/cached",
          },
        ],
        new Set(["org/new-download"]),
      ),
    ).toEqual([
      {
        modelId: "mlx-community/cached",
        revision: "abc",
        cachePath: "/cache/cached",
      },
      {
        modelId: "org/new-download",
        revision: "downloaded",
        cachePath: "",
      },
    ]);
  });
});
