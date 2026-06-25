import type { CachedModel } from "../models/cached-models";
import { parseModelReference } from "../models/model-id";

export type PiModel = { id: string; label: string };

export function modelsForPi(cachedModels: CachedModel[]): PiModel[] {
  return cachedModels.map((model) => {
    const reference = parseModelReference(model.modelId);
    return { id: reference.piModelId, label: model.modelId };
  });
}
