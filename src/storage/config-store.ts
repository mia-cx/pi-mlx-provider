import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type MlxConfig = {
  environmentOverrides?: Record<string, string>;
  invalidEnvironmentOverrides?: Record<
    string,
    { environment: string; reason: string }
  >;
  maxConcurrentModelMemoryBytes?: number;
  maxConcurrentModels?: number;
  contextWindow?: number;
  maxTokens?: number;
};

export class ConfigStore {
  constructor(readonly path: string) {}

  async load(): Promise<MlxConfig> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as MlxConfig;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async save(config: MlxConfig): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(config, null, 2)}\n`);
  }
}
