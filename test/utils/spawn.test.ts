import { describe, expect, it } from "vitest";
import { assertSafeCommand } from "../../src/utils/spawn";

describe("assertSafeCommand", () => {
  it("rejects shell strings so callers use argument arrays", () => {
    expect(() => assertSafeCommand("uv venv /tmp/x", [])).toThrow(
      "argument arrays",
    );
  });
});
