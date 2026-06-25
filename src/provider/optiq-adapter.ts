import type { ServerCommand } from "./lm-adapter";

export type OptiqServerCommandInput = {
  executable: string;
  modelId: string;
  host: string;
  port: number;
};

export function buildOptiqServerCommand({
  executable,
  modelId,
  host,
  port,
}: OptiqServerCommandInput): ServerCommand {
  return {
    command: executable,
    args: ["serve", "--model", modelId, "--host", host, "--port", String(port)],
  };
}
