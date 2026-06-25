import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigStore } from "../../src/storage/config-store";
import { manifestPathFor } from "../../src/storage/manifest-store";
import { extensionPaths } from "../../src/storage/paths";

describe("storage", () => {
  it("stores config and builds manifest paths outside the Hugging Face cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "mlx-store-"));
    const store = new ConfigStore(join(root, "config.json"));
    await store.save({
      environmentOverrides: { "mlx-community/a": "lm/default" },
    });

    expect(await store.load()).toEqual({
      environmentOverrides: { "mlx-community/a": "lm/default" },
    });
    expect(manifestPathFor(root, "mlx-community/a", "abc")).toBe(
      join(root, "models", "mlx-community--a", "abc", "manifest.json"),
    );
    expect(extensionPaths(root).runtimeCache).toBe(
      join(root, "runtime-cache.json"),
    );
  });
});
