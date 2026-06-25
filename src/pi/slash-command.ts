import { type HandlerServices, handleMlxCommand } from "../commands/handlers";
import { parseMlxCommand } from "../commands/parse";

export async function handlePiSlashCommand(
  input: string,
  services?: HandlerServices,
): Promise<string> {
  return handleMlxCommand(parseMlxCommand(input), services);
}
