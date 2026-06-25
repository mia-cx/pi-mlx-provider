import {
  renderStatusText,
  type StatusViewModel,
} from "../ui/status-view-model";
import type { MlxCommand } from "./parse";

export type HandlerServices = {
  getStatus?: () => Promise<StatusViewModel> | StatusViewModel;
  isModelCached?: (modelId: string) => Promise<boolean> | boolean;
};

export async function handleMlxCommand(
  command: MlxCommand,
  services: HandlerServices = {},
): Promise<string> {
  switch (command.type) {
    case "status":
      return renderStatusText(
        (await services.getStatus?.()) ?? {
          serverStatus: "stopped",
          downloadStatus: "idle",
        },
      );
    case "reprobe": {
      const cached = await services.isModelCached?.(command.modelId);
      if (!cached) {
        return `run /mlx init ${command.modelId} first`;
      }
      return `Reprobe scheduled for ${command.modelId}`;
    }
    default:
      return `Command ${command.type} is not implemented yet`;
  }
}
