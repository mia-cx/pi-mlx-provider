export type RequestShape = "text-to-text" | "image-text-to-text";

export type ModelManifest = {
  schemaVersion: 1;
  modelId: string;
  modelRevision: string;
  requestedRevision?: string;
  artifactFamily: "mlx";
  capabilities: {
    inputs: string[];
    outputs: string[];
  };
  preferredEnvironment: string;
  requirements: Partial<Record<RequestShape, string>>;
  probeCandidates: string[];
};
