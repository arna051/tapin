import { describe, expect, it } from 'vitest';
import { createTapinClient } from '../src/node/index.js';
import { normalizeTaskStatus, pollTapinTask } from '../src/node/tasks.js';
import { successEnvelope } from '../src/testing/index.js';

const task = (status: number) =>
  successEnvelope({
    id: 'task-1',
    task_type: 1,
    task_status: status,
    created_at: '2026-01-01',
    has_downloadable_file: false,
    task_result: [],
  });
describe('task polling', () => {
  it('normalizes all documented task statuses', () => {
    expect(normalizeTaskStatus(0)).toMatchObject({ state: 'queued', terminal: false });
    expect(normalizeTaskStatus(2)).toMatchObject({ state: 'running', terminal: false });
    expect(normalizeTaskStatus(3)).toMatchObject({ state: 'succeeded', terminal: true });
    expect(normalizeTaskStatus(4)).toMatchObject({ state: 'failed', terminal: true });
  });
  it('polls in bounded intervals until terminal', async () => {
    let calls = 0;
    const transport = { post: async () => ({ data: task(++calls < 3 ? 2 : 3) }) };
    const result = await pollTapinTask(
      createTapinClient({ token: 'secret', transport, retryReads: false }),
      { taskId: 'task-1', maxAttempts: 3, intervalMs: 1, delay: async () => undefined },
    );
    expect(result).toMatchObject({ attempts: 3, status: { state: 'succeeded', terminal: true } });
  });
  it('fails after the configured bound', async () => {
    const transport = { post: async () => ({ data: task(2) }) };
    await expect(
      pollTapinTask(createTapinClient({ token: 'secret', transport, retryReads: false }), {
        taskId: 'task-1',
        maxAttempts: 2,
        intervalMs: 0,
        delay: async () => undefined,
      }),
    ).rejects.toThrow('within 2 attempts');
  });
});
