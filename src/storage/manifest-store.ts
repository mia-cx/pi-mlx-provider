import { join } from "node:path";
import { toSafeModelId } from "../models/model-id";

export function manifestPathFor(
  root: string,
  modelId: string,
  revision: string,
): string {
  return join(
    root,
    "models",
    toSafeModelId(modelId),
    revision,
    "manifest.json",
  );
}
