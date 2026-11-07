import {
  Inject,
  Injectable,
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type Provider,
} from '@nestjs/common';
import { createTapinClient, type TapinClient, type TapinClientOptions } from '../node/index.js';
import {
  TAPIN_ADMIN_HANDLER,
  TAPIN_PUBLIC_HANDLER,
  TAPIN_ROUTE_AUTHORIZER,
  TapinRouteGuard,
  tapinControllerTypes,
  type TapinControllersOptions,
} from './controllers.js';
export const TAPIN_CLIENT = Symbol('TAPIN_CLIENT');
export type TapinModuleOptions = TapinClientOptions & { controllers?: TapinControllersOptions };
export type TapinModuleAsyncOptions = Pick<ModuleMetadata, 'imports'> & {
  inject?: any[];
  controllers?: TapinControllersOptions;
  useFactory: (...args: any[]) => TapinClientOptions | Promise<TapinClientOptions>;
};
@Injectable()
export class TapinService {
  constructor(@Inject(TAPIN_CLIENT) public readonly client: TapinClient) {}
}
@Module({})
export class TapinModule {
  static forRoot(options: TapinModuleOptions): DynamicModule {
    const provider: Provider = { provide: TAPIN_CLIENT, useValue: createTapinClient(options) };
    const routeProviders: Provider[] = options.controllers
      ? [
          { provide: TAPIN_ROUTE_AUTHORIZER, useValue: options.controllers.authorize },
          TapinRouteGuard,
          ...(options.controllers.admin
            ? [{ provide: TAPIN_ADMIN_HANDLER, useValue: options.controllers.admin }]
            : []),
          ...(options.controllers.public
            ? [{ provide: TAPIN_PUBLIC_HANDLER, useValue: options.controllers.public }]
            : []),
        ]
      : [];
    return {
      module: TapinModule,
      providers: [provider, TapinService, ...routeProviders],
      exports: [provider, TapinService],
      ...(options.controllers ? { controllers: tapinControllerTypes(options.controllers) } : {}),
    };
  }
  static forRootAsync(options: TapinModuleAsyncOptions): DynamicModule {
    const provider: Provider = {
      provide: TAPIN_CLIENT,
      inject: options.inject ?? [],
      useFactory: async (...args: any[]) => {
        const created = await options.useFactory(...args);
        if (!created || typeof created.token !== 'string' || !created.token.trim())
          throw new TypeError('TapinModule factory must return a non-empty token');
        return createTapinClient(created);
      },
    };
    const routeProviders: Provider[] = options.controllers
      ? [
          { provide: TAPIN_ROUTE_AUTHORIZER, useValue: options.controllers.authorize },
          TapinRouteGuard,
          ...(options.controllers.admin
            ? [{ provide: TAPIN_ADMIN_HANDLER, useValue: options.controllers.admin }]
            : []),
          ...(options.controllers.public
            ? [{ provide: TAPIN_PUBLIC_HANDLER, useValue: options.controllers.public }]
            : []),
        ]
      : [];
    return {
      module: TapinModule,
      imports: options.imports ?? [],
      providers: [provider, TapinService, ...routeProviders],
      exports: [provider, TapinService],
      ...(options.controllers ? { controllers: tapinControllerTypes(options.controllers) } : {}),
    };
  }
}
export * from './controllers.js';
