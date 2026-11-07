import { describe, expect, it } from 'vitest';
import type { ExecutionContext, FactoryProvider } from '@nestjs/common';
import {
  TAPIN_ADMIN_HANDLER,
  TAPIN_CLIENT,
  TAPIN_ROUTE_AUTHORIZER,
  TapinAdminController,
  TapinModule,
  TapinRouteGuard,
  TapinService,
} from '../src/nestjs/index.js';

describe('NestJS module', () => {
  it('registers no controllers by default', () => {
    const module = TapinModule.forRoot({ token: 'secret' });
    expect(module.controllers).toBeUndefined();
    expect(module.providers).toHaveLength(2);
    expect(module.exports).toHaveLength(2);
  });

  it('exposes typed client and service providers', () => {
    const module = TapinModule.forRoot({ token: 'secret' });
    expect(module.providers).toEqual(
      expect.arrayContaining([expect.objectContaining({ provide: TAPIN_CLIENT }), TapinService]),
    );
  });

  it('supports async configuration without a global singleton', async () => {
    const first = TapinModule.forRootAsync({ useFactory: async () => ({ token: 'one' }) });
    const second = TapinModule.forRootAsync({ useFactory: async () => ({ token: 'two' }) });
    expect(first.global).not.toBe(true);
    expect(second.global).not.toBe(true);
    expect(first.providers).not.toBe(second.providers);
    const provider = first.providers?.[0] as FactoryProvider;
    const client = await provider.useFactory();
    expect(client.orders).toBeDefined();
  });

  it('rejects invalid async factory output', async () => {
    const module = TapinModule.forRootAsync({ useFactory: (() => undefined) as never });
    const provider = module.providers?.[0] as FactoryProvider;
    await expect(provider.useFactory()).rejects.toThrow('non-empty token');
  });

  it('enables only explicitly configured guarded controllers', async () => {
    const calls: Array<{ operation: string; request: unknown }> = [];
    const handler = {
      handle: async (operation: string, request: unknown) => {
        calls.push({ operation, request });
        return { ok: true };
      },
    };
    const authorize = async () => true;
    const module = TapinModule.forRoot({
      token: 'secret',
      controllers: { authorize, admin: handler },
    });

    expect(module.controllers).toEqual([TapinAdminController]);
    expect(module.providers).toEqual(
      expect.arrayContaining([
        TapinRouteGuard,
        { provide: TAPIN_ROUTE_AUTHORIZER, useValue: authorize },
        { provide: TAPIN_ADMIN_HANDLER, useValue: handler },
      ]),
    );

    const controller = new TapinAdminController(handler);
    await expect(controller.verifyAccount('account-1')).resolves.toEqual({ ok: true });
    expect(calls).toEqual([
      { operation: 'accounts.verify', request: { params: { id: 'account-1' } } },
    ]);
  });

  it('delegates authorization to the host application', async () => {
    const context = {} as ExecutionContext;
    const guard = new TapinRouteGuard(async (received) => received === context);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
