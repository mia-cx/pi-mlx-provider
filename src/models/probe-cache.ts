export type ProbeStatus = "ok" | "failed";

export type ProbeResult = {
  modelId: string;
  revision: string;
  environment: string;
  packageVersion: string;
  status: ProbeStatus;
  message?: string;
  recordedAt: string;
};

export class ProbeCache {
  readonly #results: ProbeResult[] = [];

  record(
    result: Omit<ProbeResult, "recordedAt"> & { recordedAt?: string },
  ): ProbeResult {
    const stored = {
      ...result,
      recordedAt: result.recordedAt ?? new Date().toISOString(),
    };
    this.#results.push(stored);
    return stored;
  }

  historyFor(
    modelId: string,
    revision: string,
    environment: string,
    packageVersion: string,
  ): ProbeResult[] {
    return this.#results.filter(
      (result) =>
        result.modelId === modelId &&
        result.revision === revision &&
        result.environment === environment &&
        result.packageVersion === packageVersion,
    );
  }

  latestFor(
    modelId: string,
    revision: string,
    environment: string,
    packageVersion: string,
  ): ProbeResult | undefined {
    return this.historyFor(modelId, revision, environment, packageVersion).at(
      -1,
    );
  }
}
