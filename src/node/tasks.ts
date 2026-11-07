import { taskDetailResponseSchema, type taskStatusSchema } from '../contracts.js';
import { TapinError, type TapinEnvelope } from '../core.js';
import type { TapinClient } from './index.js';
import type { z } from 'zod';

export type TaskStatusCode = z.infer<typeof taskStatusSchema>;
export const normalizeTaskStatus = (code: TaskStatusCode) =>
  ({
    code,
    state:
      code === 0
        ? 'queued'
        : code === 1 || code === 2
          ? 'running'
          : code === 3
            ? 'succeeded'
            : 'failed',
    terminal: code === 3 || code === 4,
  }) as const;
export type PollTaskOptions = {
  taskId: string;
  maxAttempts?: number;
  intervalMs?: number;
  delay?: (milliseconds: number) => Promise<void>;
  signal?: AbortSignal;
};
export async function pollTapinTask(client: TapinClient, options: PollTaskOptions) {
  if (!options.taskId.trim()) throw new TypeError('taskId is required');
  const maxAttempts = options.maxAttempts ?? 20;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100)
    throw new RangeError('maxAttempts must be between 1 and 100');
  const intervalMs = options.intervalMs ?? 1_000;
  if (intervalMs < 0 || intervalMs > 60_000)
    throw new RangeError('intervalMs must be between 0 and 60000');
  const delay =
    options.delay ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error('Task polling aborted');
    const raw = (await client.tasks.detail(
      { task_id: options.taskId },
      options.signal ? { signal: options.signal } : {},
    )) as TapinEnvelope;
    const parsed = taskDetailResponseSchema.safeParse(raw);
    if (!parsed.success)
      throw new TapinError('Tapin task detail does not match the audited contract', undefined, {
        issues: parsed.error.issues,
      });
    const status = normalizeTaskStatus(parsed.data.entries.task_status);
    if (status.terminal) return { ...parsed.data.entries, status, attempts: attempt };
    if (attempt < maxAttempts) await delay(intervalMs);
  }
  throw new TapinError(
    `Tapin task ${options.taskId} did not reach a terminal state within ${maxAttempts} attempts`,
  );
}
