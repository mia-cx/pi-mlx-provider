export type Stoppable = { stopAll(): void | Promise<void> };

export async function stopOnShutdown(stoppable: Stoppable): Promise<void> {
  await stoppable.stopAll();
}
