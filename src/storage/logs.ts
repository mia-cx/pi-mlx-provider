const tokenPatterns = [
  /hf_[A-Za-z0-9_]{20,}/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
];

export function redactLogText(
  text: string,
  env: Record<string, string | undefined> = process.env,
): string {
  let redacted = text;

  for (const pattern of tokenPatterns) {
    redacted = redacted.replace(pattern, "[redacted]");
  }

  for (const [key, value] of Object.entries(env)) {
    if (!value || value.length < 4) continue;
    if (!/(TOKEN|SECRET|KEY|PASSWORD|AUTH)/i.test(key)) continue;
    redacted = redacted.replaceAll(value, "[redacted]");
  }

  return redacted;
}
