import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adaptAttachmentPaths } from "../../src/provider/attachment-paths";

describe("adaptAttachmentPaths", () => {
  it("converts existing image paths into attachments and filename markers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mlx-attachments-"));
    await writeFile(join(dir, "cat.png"), "not really an image");

    const result = await adaptAttachmentPaths({
      text: "describe ./cat.png",
      cwd: dir,
      activeEnvironmentSupportsImages: true,
    });

    expect(result.text).toBe("describe [attached image: cat.png]");
    expect(result.attachments).toEqual([
      { kind: "image", path: join(dir, "cat.png"), displayName: "cat.png" },
    ]);
  });

  it("leaves image paths as text with a warning when the active environment cannot attach them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mlx-attachments-"));
    await writeFile(join(dir, "cat.png"), "not really an image");

    const result = await adaptAttachmentPaths({
      text: "describe ./cat.png",
      cwd: dir,
      activeEnvironmentSupportsImages: false,
    });

    expect(result.text).toContain("[MLX warning:");
    expect(result.text).toContain("describe ./cat.png");
    expect(result.attachments).toEqual([]);
  });
});
