import type { JsonRecord, TapinEnvelope } from '../core.js';
export class FakeTapinTransport {
  readonly calls: Array<{ path: string; input: JsonRecord }> = [];
  constructor(private readonly responses: Record<string, TapinEnvelope> = {}) {}
  async request(path: string, input: JsonRecord = {}): Promise<TapinEnvelope> {
    this.calls.push({ path, input });
    const response = this.responses[path];
    if (!response) throw new Error(`No fake response for ${path}`);
    return structuredClone(response);
  }
  async post(path: string, input: JsonRecord = {}) {
    return { data: await this.request(path, input) };
  }
  async get(path: string) {
    return { data: await this.request(path, {}) };
  }
}
export const successEnvelope = <T>(entries: T): TapinEnvelope<T> => ({
  returns: { status: 200, message: 'OK' },
  entries,
});

type MemoryEntry<T> = { fingerprint: string; state: 'pending' | 'complete' | 'unknown'; value?: T };
export class InMemoryIdempotencyStore<T> {
  readonly records = new Map<string, MemoryEntry<T>>();
  async reserve(key: string, fingerprint: string) {
    const existing = this.records.get(key);
    if (!existing) {
      this.records.set(key, { fingerprint, state: 'pending' });
      return { state: 'acquired' as const };
    }
    if (existing.fingerprint !== fingerprint) return { state: 'conflict' as const };
    if (existing.state === 'complete')
      return { state: 'replay' as const, value: existing.value as T };
    return { state: 'pending' as const };
  }
  async complete(key: string, fingerprint: string, value: T) {
    this.records.set(key, { fingerprint, state: 'complete', value });
  }
  async markUnknown(key: string, fingerprint: string) {
    this.records.set(key, { fingerprint, state: 'unknown' });
  }
}

export const deterministicClock = (instant: string | Date) => {
  const value = new Date(instant);
  if (Number.isNaN(value.valueOf())) throw new TypeError('Invalid deterministic clock instant');
  return () => new Date(value);
};
export const sequentialIds = (prefix = 'id') => {
  let sequence = 0;
  return () => `${prefix}-${++sequence}`;
};
