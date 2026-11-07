import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';

export const TAPIN_ROUTE_AUTHORIZER = Symbol('TAPIN_ROUTE_AUTHORIZER');
export const TAPIN_ADMIN_HANDLER = Symbol('TAPIN_ADMIN_HANDLER');
export const TAPIN_PUBLIC_HANDLER = Symbol('TAPIN_PUBLIC_HANDLER');
export type TapinRouteAuthorizer = (context: ExecutionContext) => boolean | Promise<boolean>;
export type TapinRouteRequest = {
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
};
export type TapinRouteHandler = {
  handle(operation: string, request: TapinRouteRequest): Promise<unknown>;
};
export type TapinControllersOptions = {
  authorize: TapinRouteAuthorizer;
  admin?: TapinRouteHandler;
  public?: TapinRouteHandler;
};

@Injectable()
export class TapinRouteGuard implements CanActivate {
  constructor(@Inject(TAPIN_ROUTE_AUTHORIZER) private readonly authorize: TapinRouteAuthorizer) {}
  canActivate(context: ExecutionContext) {
    return this.authorize(context);
  }
}

@Controller('admin/tapin')
@UseGuards(TapinRouteGuard)
export class TapinAdminController {
  constructor(@Inject(TAPIN_ADMIN_HANDLER) private readonly handler: TapinRouteHandler) {}
  private call(operation: string, request: TapinRouteRequest = {}) {
    return this.handler.handle(operation, request);
  }
  @Get('accounts') listAccounts(@Query() query: Record<string, unknown>) {
    return this.call('accounts.list', { query });
  }
  @Post('accounts') createAccount(@Body() body: unknown) {
    return this.call('accounts.create', { body });
  }
  @Patch('accounts/:id') updateAccount(@Param('id') id: string, @Body() body: unknown) {
    return this.call('accounts.update', { params: { id }, body });
  }
  @Post('accounts/:id/verify') verifyAccount(@Param('id') id: string) {
    return this.call('accounts.verify', { params: { id } });
  }
  @Post('accounts/:id/enable') enableAccount(@Param('id') id: string) {
    return this.call('accounts.enable', { params: { id } });
  }
  @Post('accounts/:id/disable') disableAccount(@Param('id') id: string) {
    return this.call('accounts.disable', { params: { id } });
  }
  @Post('accounts/:id/sync-shops') syncShops(@Param('id') id: string) {
    return this.call('accounts.syncShops', { params: { id } });
  }
  @Post('locations/sync') syncLocations(@Body() body: unknown) {
    return this.call('locations.sync', { body });
  }
  @Get('locations/sync-status') locationSyncStatus() {
    return this.call('locations.syncStatus');
  }
  @Get('tasks') listTasks(@Query() query: Record<string, unknown>) {
    return this.call('tasks.list', { query });
  }
  @Get('tasks/:id') taskDetail(@Param('id') id: string) {
    return this.call('tasks.detail', { params: { id } });
  }
}

@Controller()
@UseGuards(TapinRouteGuard)
export class TapinPublicController {
  constructor(@Inject(TAPIN_PUBLIC_HANDLER) private readonly handler: TapinRouteHandler) {}
  private call(operation: string, request: TapinRouteRequest = {}) {
    return this.handler.handle(operation, request);
  }
  @Get('locations/provinces') provinces(@Query() query: Record<string, unknown>) {
    return this.call('locations.provinces', { query });
  }
  @Get('locations/provinces/:provinceCode/cities') cities(
    @Param('provinceCode') provinceCode: string,
  ) {
    return this.call('locations.cities', { params: { provinceCode } });
  }
  @Get('locations/cities/search') searchCities(@Query() query: Record<string, unknown>) {
    return this.call('locations.searchCities', { query });
  }
  @Post('shipping/tapin/quote') quote(@Body() body: unknown) {
    return this.call('shipping.quote', { body });
  }
  @Get('shipping/tapin/parcels/:id/tracking') tracking(@Param('id') id: string) {
    return this.call('shipping.tracking', { params: { id } });
  }
  @Get('shipping/tapin/parcels/:id/label') label(@Param('id') id: string) {
    return this.call('shipping.label', { params: { id } });
  }
}

export const tapinControllerTypes = (options?: TapinControllersOptions): Type[] => [
  ...(options?.admin ? [TapinAdminController] : []),
  ...(options?.public ? [TapinPublicController] : []),
];
