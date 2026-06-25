import { describe, expect, it } from "vitest";
import { parseByteSize } from "../../src/utils/sizes";

describe("parseByteSize", () => {
  it("parses decimal and binary memory amounts", () => {
    expect(parseByteSize("8GB")).toBe(8_000_000_000);
    expect(parseByteSize("2GiB")).toBe(2 * 1024 ** 3);
    expect(parseByteSize("512")).toBe(512);
  });
});
