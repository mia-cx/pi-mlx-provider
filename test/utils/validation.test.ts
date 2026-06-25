import { describe, expect, it } from "vitest";
import { assertSupportedPlatform } from "../../src/utils/validation";

describe("assertSupportedPlatform", () => {
  it("rejects non-Apple-Silicon platforms before runtime work", () => {
    expect(() =>
      assertSupportedPlatform({ platform: "linux", arch: "x64" }),
    ).toThrow("pi-mlx-provider v1 requires macOS on Apple Silicon");
  });
});
