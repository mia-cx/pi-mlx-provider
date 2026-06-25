import { type ChildProcess, spawn } from "node:child_process";

export type SpawnCommand = {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export function assertSafeCommand(command: string, args: string[]): void {
  if (args.length === 0 && /\s|[;&|`$<>]/.test(command)) {
    throw new Error(
      "Spawn commands must use argument arrays, not shell strings.",
    );
  }
}

export function spawnWithArgs({
  command,
  args,
  cwd,
  env,
}: SpawnCommand): ChildProcess {
  assertSafeCommand(command, args);
  return spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
}
