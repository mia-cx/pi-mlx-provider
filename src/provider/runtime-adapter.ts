import type { ServerCommand } from "./lm-adapter";

export type RuntimeAdapter = {
  buildServerCommand(input: {
    modelId: string;
    host: string;
    port: number;
    pythonPath?: string;
    executable?: string;
  }): ServerCommand;
};
