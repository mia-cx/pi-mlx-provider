import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class RuntimeCacheStore<T = unknown> {
  constructor(readonly path: string) {}

  async load(defaultValue: T): Promise<T> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return defaultValue;
      throw error;
    }
  }

  async save(value: T): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(value, null, 2)}\n`);
  }
}
