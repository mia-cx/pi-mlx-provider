export type OwnedProcess = {
  pid: number;
  modelId: string;
  environment: string;
};

export type ProcessManagerOptions = {
  kill?: (pid: number, signal: NodeJS.Signals) => void;
};

export class ProcessManager {
  readonly #owned = new Map<number, OwnedProcess>();
  readonly #kill: (pid: number, signal: NodeJS.Signals) => void;

  constructor({ kill = process.kill }: ProcessManagerOptions = {}) {
    this.#kill = kill;
  }

  track(process: OwnedProcess): void {
    this.#owned.set(process.pid, process);
  }

  ownedProcesses(): OwnedProcess[] {
    return [...this.#owned.values()];
  }

  async stopAll(): Promise<void> {
    for (const process of this.#owned.values()) {
      this.#kill(process.pid, "SIGTERM");
    }
    this.#owned.clear();
  }
}
