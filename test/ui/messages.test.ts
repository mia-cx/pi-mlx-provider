import { describe, expect, it } from "vitest";
import { unknownRuntimeMessage } from "../../src/ui/messages";

describe("unknownRuntimeMessage", () => {
  it("includes a model-card link and manual repair command", () => {
    expect(unknownRuntimeMessage("mlx-community/example")).toContain(
      "/mlx runtime set mlx-community/example",
    );
  });
});
