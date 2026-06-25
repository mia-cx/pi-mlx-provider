export type RuntimeServerStatus = {
  status:
    | "stopped"
    | "starting"
    | "running"
    | "switching"
    | "stopping"
    | "error";
  modelId?: string;
  environment?: string;
  pid?: number;
  prewarmed?: boolean;
  lastError?: string;
};

export class RuntimeServerManager {
  #status: RuntimeServerStatus = { status: "stopped" };

  async prewarm({
    modelId,
    environment,
    pid,
  }: {
    modelId: string;
    environment: string;
    pid: number;
  }): Promise<void> {
    this.#status = {
      status: "running",
      modelId,
      environment,
      pid,
      prewarmed: true,
    };
  }

  selectModel(modelId: string): void {
    if (this.#status.modelId === modelId) {
      this.#status = { ...this.#status, prewarmed: false };
      return;
    }

    if (this.#status.prewarmed) {
      this.#status = { status: "stopped" };
    }
  }

  stopAll(): void {
    this.#status = { status: "stopped" };
  }

  status(): RuntimeServerStatus {
    return { ...this.#status };
  }
}
