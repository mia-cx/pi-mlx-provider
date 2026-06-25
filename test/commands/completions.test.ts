import { describe, expect, it } from "vitest";
import { completeMlxCommand } from "../../src/commands/completion-tree";

describe("completeMlxCommand", () => {
  it("adds trailing spaces to non-terminal root suggestions", () => {
    expect(completeMlxCommand("/mlx ")).toEqual([
      "status",
      "init ",
      "start ",
      "stop",
      "logs",
      "reprobe ",
      "context ",
      "tokens ",
      "max-tokens ",
      "runtime ",
      "max ",
    ]);
  });

  it("treats exact non-terminal tokens as if they had a trailing space", () => {
    expect(completeMlxCommand("/mlx init")).toEqual([
      "lm",
      "vlm",
      "optiq",
      "--all",
    ]);
    expect(completeMlxCommand("/mlx max")).toEqual([
      "memory ",
      "models ",
      "context ",
      "tokens ",
      "output ",
    ]);
  });
});
