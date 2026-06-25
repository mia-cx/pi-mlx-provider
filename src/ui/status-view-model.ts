export type StatusViewModel =
  | {
      serverStatus: string;
      downloadStatus: string;
      contextWindow?: number;
      maxTokens?: number;
    }
  | {
      server: {
        status: string;
        modelId?: string;
        environment?: string;
        prewarmed?: boolean;
      };
      download: {
        downloadStatus: string;
        modelId?: string | null;
        progress?: string | null;
      };
      contextWindow?: number;
      maxTokens?: number;
      activity?: string | null;
      unresolvedModels?: Array<{ modelId: string; modelCardUrl: string }>;
    };

export function renderStatusText(status: StatusViewModel): string {
  if ("serverStatus" in status) {
    return [
      `Server: ${status.serverStatus}`,
      `Download: ${status.downloadStatus}`,
      ...(status.contextWindow
        ? [`Context: ${formatTokens(status.contextWindow)}`]
        : []),
      ...(status.maxTokens
        ? [`Max output: ${formatTokens(status.maxTokens)}`]
        : []),
    ].join("\n");
  }

  const lines = [
    `Server: ${status.server.status}`,
    `Model: ${status.server.modelId ?? "none"}`,
    `Environment: ${status.server.environment ?? "none"}`,
    `Prewarmed: ${status.server.prewarmed ? "yes" : "no"}`,
    `Download: ${status.download.downloadStatus}`,
    ...(status.contextWindow
      ? [`Context: ${formatTokens(status.contextWindow)}`]
      : []),
    ...(status.maxTokens
      ? [`Max output: ${formatTokens(status.maxTokens)}`]
      : []),
  ];

  if (status.activity) lines.push(`Activity: ${status.activity}`);

  if (status.download.modelId)
    lines.push(`Downloading: ${status.download.modelId}`);
  if (status.download.progress)
    lines.push(`Progress: ${status.download.progress}`);

  if (status.unresolvedModels?.length) {
    lines.push("Needs manual repair:");
    for (const model of status.unresolvedModels) {
      lines.push(`- ${model.modelId}: ${model.modelCardUrl}`);
    }
  }

  return lines.join("\n");
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1000 && tokens % 1000 === 0) return `${tokens / 1000}k`;
  return tokens.toLocaleString("en-US");
}
