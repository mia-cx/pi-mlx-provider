import { join } from "node:path";

export type ExtensionPaths = {
  root: string;
  models: string;
  environments: string;
  runtimeCache: string;
  config: string;
  logs: string;
};

export function extensionPaths(root: string): ExtensionPaths {
  return {
    root,
    models: join(root, "models"),
    environments: join(root, "environments"),
    runtimeCache: join(root, "runtime-cache.json"),
    config: join(root, "config.json"),
    logs: join(root, "logs"),
  };
}
