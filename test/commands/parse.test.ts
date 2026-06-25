import { describe, expect, it } from "vitest";
import { parseMlxCommand } from "../../src/commands/parse";

describe("parseMlxCommand", () => {
  it("treats /mlx as status", () => {
    expect(parseMlxCommand("/mlx")).toEqual({ type: "status" });
  });

  it("normalizes environment init targets", () => {
    expect(parseMlxCommand("/mlx init vlm@0.4.3")).toEqual({
      type: "init",
      target: { kind: "environment", environment: "vlm", version: "0.4.3" },
      force: false,
    });
  });

  it("accepts Hugging Face model ids as init targets", () => {
    expect(
      parseMlxCommand("/mlx init mlx-community/Qwen2.5-7B-4bit --force"),
    ).toEqual({
      type: "init",
      target: { kind: "model", modelId: "mlx-community/Qwen2.5-7B-4bit" },
      force: true,
    });
  });

  it("parses context window commands", () => {
    expect(parseMlxCommand("/mlx context 128k")).toEqual({
      type: "context",
      value: "128k",
    });
    expect(parseMlxCommand("/mlx max context auto")).toEqual({
      type: "max",
      key: "context",
      value: "auto",
    });
  });

  it("parses max output token commands", () => {
    expect(parseMlxCommand("/mlx tokens 16k")).toEqual({
      type: "tokens",
      value: "16k",
    });
    expect(parseMlxCommand("/mlx max-tokens auto")).toEqual({
      type: "tokens",
      value: "auto",
    });
    expect(parseMlxCommand("/mlx max output 32k")).toEqual({
      type: "max",
      key: "tokens",
      value: "32k",
    });
  });
});
