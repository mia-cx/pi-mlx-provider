export type PlatformInfo = {
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
};

export function assertSupportedPlatform(platform: PlatformInfo): void {
  if (platform.platform === "darwin" && platform.arch === "arm64") {
    return;
  }

  throw new Error(
    "pi-mlx-provider v1 requires macOS on Apple Silicon; MLX runtimes are not supported on this platform.",
  );
}
