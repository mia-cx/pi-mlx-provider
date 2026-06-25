const units: Record<string, number> = {
  b: 1,
  kb: 1_000,
  mb: 1_000_000,
  gb: 1_000_000_000,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
};

export function parseByteSize(input: string): number {
  const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?i?b)?$/i);
  if (!match) throw new Error(`Invalid byte size: ${input}`);

  const value = Number(match[1]);
  const unit = (match[2] ?? "b").toLowerCase();
  const multiplier = units[unit];
  if (!multiplier) throw new Error(`Unsupported byte size unit: ${unit}`);

  return Math.round(value * multiplier);
}
