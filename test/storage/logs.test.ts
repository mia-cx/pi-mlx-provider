import { describe, expect, it } from "vitest";
import { redactLogText } from "../../src/storage/logs";

describe("redactLogText", () => {
  it("redacts tokens before logs reach chat or dialog", () => {
    expect(
      redactLogText(
        "Authorization: Bearer hf_abcdefghijklmnopqrstuvwxyz123456",
        { SECRET: "topsecret" },
      ),
    ).toContain("[redacted]");
    expect(redactLogText("topsecret", { SECRET: "topsecret" })).toBe(
      "[redacted]",
    );
  });
});
