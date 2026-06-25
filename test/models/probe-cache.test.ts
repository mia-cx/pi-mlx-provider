import { describe, expect, it } from "vitest";
import { ProbeCache } from "../../src/models/probe-cache";

describe("ProbeCache", () => {
  it("keeps probe history while exposing the latest result", () => {
    const cache = new ProbeCache();
    cache.record({
      modelId: "m",
      revision: "r",
      environment: "vlm",
      packageVersion: "0.6.3",
      status: "failed",
      message: "bad params",
    });
    cache.record({
      modelId: "m",
      revision: "r",
      environment: "vlm",
      packageVersion: "0.6.3",
      status: "ok",
    });

    expect(cache.historyFor("m", "r", "vlm", "0.6.3")).toHaveLength(2);
    expect(cache.latestFor("m", "r", "vlm", "0.6.3")?.status).toBe("ok");
  });
});
