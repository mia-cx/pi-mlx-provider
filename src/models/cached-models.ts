import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type CachedModel = {
  modelId: string;
  revision: string;
  cachePath: string;
};

export type ScanCachedModelsInput = {
  cacheRoots: string[];
};

export function mergeCachedModelsWithKnownIds(
  cachedModels: CachedModel[],
  knownModelIds: Set<string>,
): CachedModel[] {
  const modelsById = new Map(
    cachedModels.map((model) => [model.modelId, model] as const),
  );

  for (const modelId of knownModelIds) {
    if (!modelsById.has(modelId)) {
      modelsById.set(modelId, {
        modelId,
        revision: "downloaded",
        cachePath: "",
      });
    }
  }

  return [...modelsById.values()].sort((a, b) =>
    a.modelId.localeCompare(b.modelId),
  );
}

export async function scanCachedModels({
  cacheRoots,
}: ScanCachedModelsInput): Promise<CachedModel[]> {
  const models: CachedModel[] = [];

  for (const root of cacheRoots) {
    let entries: string[];
    try {
      entries = await readdir(root);
    } catch {
      continue;
    }

    for (const entry of entries.sort()) {
      if (!entry.startsWith("models--")) continue;

      const modelId = entry.slice("models--".length).replaceAll("--", "/");
      const cachePath = join(root, entry);
      if (!(await isMlxFamily(cachePath, modelId))) continue;

      const revision = await latestSnapshotRevision(cachePath);
      if (!revision) continue;

      models.push({ modelId, revision, cachePath });
    }
  }

  return models.sort((a, b) => a.modelId.localeCompare(b.modelId));
}

async function isMlxFamily(
  cachePath: string,
  modelId: string,
): Promise<boolean> {
  if (modelId.startsWith("mlx-community/")) return true;

  for (const file of ["README.md", "readme.md"]) {
    try {
      const text = await readFile(join(cachePath, file), "utf8");
      if (/mlx-(lm|vlm|optiq)|mlx_lm|mlx_vlm|optiq/i.test(text)) return true;
    } catch {
      // Missing README is fine; this is a cheap local signal only.
    }
  }

  return false;
}

async function latestSnapshotRevision(
  cachePath: string,
): Promise<string | null> {
  try {
    const snapshots = await readdir(join(cachePath, "snapshots"));
    return snapshots.sort()[0] ?? null;
  } catch {
    return null;
  }
}
