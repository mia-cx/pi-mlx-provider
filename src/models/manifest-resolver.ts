import type { ModelManifest } from "./manifest";

export type ManifestMetadata = {
  modelId: string;
  resolvedRevision: string;
  requestedRevision?: string;
  readme?: string;
  tags?: string[];
  files?: string[];
  pipelineTag?: string;
  libraryName?: string;
};

export function resolveManifestFromMetadata(
  metadata: ManifestMetadata,
): ModelManifest {
  const text = [
    metadata.modelId,
    metadata.readme ?? "",
    ...(metadata.tags ?? []),
    ...(metadata.files ?? []),
    metadata.pipelineTag ?? "",
    metadata.libraryName ?? "",
  ].join("\n");

  const optiq = /optiq/i.test(text);
  const vlmVersion = extractVlmVersion(text);
  const multimodal = optiq || /vision|image|vlm|multi.?modal/i.test(text);

  const preferredEnvironment = optiq
    ? "optiq/default"
    : multimodal
      ? `vlm/${vlmVersion ?? "default"}`
      : "lm/default";

  return {
    schemaVersion: 1,
    modelId: metadata.modelId,
    modelRevision: metadata.resolvedRevision,
    ...(metadata.requestedRevision
      ? { requestedRevision: metadata.requestedRevision }
      : {}),
    artifactFamily: "mlx",
    capabilities: {
      inputs: multimodal ? ["text", "image"] : ["text"],
      outputs: ["text"],
    },
    preferredEnvironment,
    requirements: {
      "text-to-text": "lm/default",
      ...(multimodal ? { "image-text-to-text": preferredEnvironment } : {}),
    },
    probeCandidates: rankedProbeCandidates({ optiq, multimodal, vlmVersion }),
  };
}

function extractVlmVersion(text: string): string | null {
  return (
    text.match(/mlx-vlm\s*(?:==|@|\s)\s*([0-9]+\.[0-9]+\.[0-9]+)/i)?.[1] ?? null
  );
}

function rankedProbeCandidates({
  optiq,
  multimodal,
  vlmVersion,
}: {
  optiq: boolean;
  multimodal: boolean;
  vlmVersion: string | null;
}): string[] {
  if (optiq) return ["optiq/default", "lm/default"];
  if (multimodal) return [`vlm/${vlmVersion ?? "default"}`, "lm/default"];
  return ["lm/default"];
}
