import { completeMlxCommand } from "../commands/completion-tree";

export function completePiSlashCommand(input: string): string[] {
  return completeMlxCommand(input);
}
