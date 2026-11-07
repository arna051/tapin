import axios, { type AxiosError } from 'axios';
import { randomUUID } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';
import type { output, ZodType } from 'zod';
import {
  endpointCapabilities,
  endpointHttpMethod,
  endpointPaths,
  orderRegisterCapability,
  tapinEnvelopeSchema,
  TapinError,
  TapinNotSentError,
  TapinUnknownOutcomeError,
  type EndpointCapability,
  type JsonRecord,
  type RegistrationMode,
  type TapinEnvelope,
} from '../core.js';
import { registrationModeSchema, tapinCodes } from '../domain.js';
import {
  endpointContracts,
  orderRegistrationResponseSchema,
  quoteResponseSchema,
  type ProviderOrderRegistrationInput,
} from '../contracts.js';

export type TapinClientOptions = {
  token: string;
  baseURL?: string;
  timeoutMs?: number;
  authorizationScheme?: 'bare' | 'JWT';
  maxDocumentBytes?: number;
  transport?: TapinTransport;
  clock?: () => Date;
  idGenerator?: () => string;
  retryReads?: false | { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number };
  delay?: (milliseconds: number) => Promise<void>;
};
export type TapinRequestOptions = { signal?: AbortSignal; timeoutMs?: number };
export type TapinDocument = {
  contentType: 'application/pdf' | 'text/html';
  filename?: string;
  stream: NodeJS.ReadableStream;
};
export type RegisterOrderInput = Omit<ProviderOrderRegistrationInput, 'register_type'> & {
  mode: RegistrationMode;
  register_type?: never;
};
export type TapinTransport = {
  post(
    path: string,
    input?: JsonRecord,
    config?: {
      signal?: AbortSignal;
      timeout?: number;
      responseType?: 'stream';
      maxContentLength?: number;
    },
  ): Promise<{ data: unknown; headers?: Record<string, unknown> }>;
  get?(
    path: string,
    config?: {
      signal?: AbortSignal;
      timeout?: number;
      responseType?: 'stream';
      maxContentLength?: number;
    },
  ): Promise<{ data: unknown; headers?: Record<string, unknown> }>;
};
type CapabilityGroup = Record<string, EndpointCapability>;
type EndpointPath = keyof typeof endpointContracts;
type EndpointResult<Path extends EndpointPath> = (typeof endpointContracts)[Path] extends {
  kind: 'document';
}
  ? TapinDocument
  : (typeof endpointContracts)[Path] extends { response: infer Schema extends ZodType }
    ? output<Schema>
    : never;
type Resource<P extends Record<string, string>, C extends CapabilityGroup> = {
  [K in keyof P]: (
    input?: JsonRecord,
    options?: TapinRequestOptions,
  ) => Promise<
    K extends keyof C ? (P[K] extends EndpointPath ? EndpointResult<P[K]> : never) : never
  >;
};

const requestConfig = (options: TapinRequestOptions) => ({
  ...(options.signal ? { signal: options.signal } : {}),
  ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
});
const header = (headers: Record<string, unknown> | undefined, name: string) => {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return typeof value === 'string' ? value : undefined;
};
const filenameFromDisposition = (value?: string) => {
  const match = value?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
  if (!match?.[1]) return undefined;
  const decoded = decodeURIComponent(match[1])
    .replace(/[\\/\0]/g, '_')
    .trim();
  return decoded || undefined;
};

export function createTapinClient(options: TapinClientOptions) {
  if (!options.token.trim()) throw new TypeError('Tapin token is required');
  const maxDocumentBytes = options.maxDocumentBytes ?? 25 * 1024 * 1024;
  const runtime = Object.freeze({
    now: options.clock ?? (() => new Date()),
    newId: options.idGenerator ?? randomUUID,
  });
  const retry =
    options.retryReads === false
      ? { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }
      : {
          maxAttempts: options.retryReads?.maxAttempts ?? 3,
          baseDelayMs: options.retryReads?.baseDelayMs ?? 100,
          maxDelayMs: options.retryReads?.maxDelayMs ?? 1_000,
        };
  if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 1 || retry.maxAttempts > 5)
    throw new RangeError('retryReads.maxAttempts must be between 1 and 5');
  const delay =
    options.delay ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const http: TapinTransport =
    options.transport ??
    axios.create({
      baseURL: options.baseURL ?? 'https://api.tapin.ir/api/v2/public/',
      timeout: options.timeoutMs ?? 15_000,
      headers: {
        Authorization:
          options.authorizationScheme === 'JWT' ? `JWT ${options.token}` : options.token,
        'Content-Type': 'application/json',
      },
      maxContentLength: 10 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024,
    });

  const requestJson = async (
    path: EndpointPath,
    input: JsonRecord,
    options: TapinRequestOptions,
    capability: EndpointCapability,
  ): Promise<TapinEnvelope> => {
    const contract = endpointContracts[path];
    if (contract.kind !== 'json')
      throw new TapinNotSentError('JSON request was assigned a document endpoint contract');
    const request = contract.request.safeParse(input);
    if (!request.success)
      throw new TapinNotSentError('Request does not match the endpoint contract and was not sent', {
        issues: request.error.issues,
      });
    input = request.data as JsonRecord;
    try {
      JSON.stringify(input);
    } catch (error) {
      throw new TapinNotSentError('Request is not JSON-wire-safe and was not sent', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      let response: Awaited<ReturnType<TapinTransport['post']>>;
      for (let attempt = 1; ; attempt += 1) {
        try {
          response = await http.post(path, input, requestConfig(options));
          break;
        } catch (error) {
          const axiosError = error as AxiosError;
          const status = axiosError.response?.status;
          const retryable =
            !capability.mutates && (status === undefined || [429, 502, 503, 504].includes(status));
          if (!retryable || attempt >= retry.maxAttempts) throw error;
          await delay(Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** (attempt - 1)));
        }
      }
      const envelope = tapinEnvelopeSchema.safeParse(response.data);
      if (!envelope.success) {
        if (capability.mutates)
          throw new TapinUnknownOutcomeError(
            'Mutation returned an unrecognized response; reconcile before retrying',
          );
        throw new TapinError('Tapin returned an invalid response envelope');
      }
      if (envelope.data.returns.status < 200 || envelope.data.returns.status >= 300)
        throw new TapinError(envelope.data.returns.message, envelope.data.returns.status, {
          providerStatus: envelope.data.returns.status,
        });
      const parsed = contract.response.safeParse(response.data);
      if (!parsed.success) {
        if (capability.mutates)
          throw new TapinUnknownOutcomeError(
            'Mutation returned an unrecognized response; reconcile before retrying',
          );
        throw new TapinError('Tapin returned an invalid response envelope');
      }
      return response.data as TapinEnvelope;
    } catch (error) {
      if (error instanceof TapinUnknownOutcomeError || error instanceof TapinError) throw error;
      const axiosError = error as AxiosError;
      const provider = tapinEnvelopeSchema.safeParse(axiosError.response?.data);
      if (provider.success)
        throw new TapinError(provider.data.returns.message, provider.data.returns.status, {
          httpStatus: axiosError.response?.status,
          providerStatus: provider.data.returns.status,
        });
      if (
        [
          'ENOTFOUND',
          'ECONNREFUSED',
          'ERR_INVALID_URL',
          'ERR_BAD_OPTION',
          'ERR_BAD_OPTION_VALUE',
        ].includes(axiosError.code ?? '')
      )
        throw new TapinNotSentError('Tapin request could not be sent', {
          code: axiosError.code,
        });
      if (capability.mutates)
        throw new TapinUnknownOutcomeError(
          'Mutation outcome is unknown; reconcile before retrying',
          { code: axiosError.code, httpStatus: axiosError.response?.status },
        );
      throw new TapinError('Tapin request failed', axiosError.response?.status, {
        code: axiosError.code,
      });
    }
  };

  const requestDocument = async (
    path: string,
    input: JsonRecord,
    options: TapinRequestOptions,
    contractPath: EndpointPath,
    contractInput: JsonRecord,
  ): Promise<TapinDocument> => {
    const request = endpointContracts[contractPath].request.safeParse(contractInput);
    if (!request.success)
      throw new TapinNotSentError('Request does not match the endpoint contract and was not sent', {
        issues: request.error.issues,
      });
    try {
      const config = {
        ...requestConfig(options),
        responseType: 'stream' as const,
        maxContentLength: maxDocumentBytes,
      };
      const response =
        endpointHttpMethod(contractPath) === 'GET'
          ? await (() => {
              if (!http.get)
                throw new TapinNotSentError('Injected transport does not support GET documents');
              return http.get(path, config);
            })()
          : await http.post(path, input, config);
      const contentType = header(response.headers, 'content-type')?.split(';')[0]?.trim();
      if (contentType !== 'application/pdf' && contentType !== 'text/html')
        throw new TapinError('Tapin returned an unsafe document content type', undefined, {
          contentType,
        });
      const length = Number(header(response.headers, 'content-length'));
      if (Number.isFinite(length) && length > maxDocumentBytes)
        throw new TapinError('Tapin document exceeds the configured size limit');
      if (typeof response.data !== 'object' || response.data === null || !('pipe' in response.data))
        throw new TapinError('Tapin document response is not a readable stream');
      const filename = filenameFromDisposition(header(response.headers, 'content-disposition'));
      const source = response.data as Readable;
      let receivedBytes = 0;
      const limited = new Transform({
        transform(chunk: Buffer | string, encoding, callback) {
          receivedBytes += Buffer.isBuffer(chunk)
            ? chunk.byteLength
            : Buffer.byteLength(chunk, encoding);
          if (receivedBytes > maxDocumentBytes) {
            callback(new TapinError('Tapin document exceeds the configured size limit'));
            source.destroy();
            return;
          }
          callback(null, chunk);
        },
      });
      source.once('error', (error) => limited.destroy(error));
      source.pipe(limited);
      return {
        contentType,
        ...(filename ? { filename } : {}),
        stream: limited,
      };
    } catch (error) {
      if (error instanceof TapinError) throw error;
      const axiosError = error as AxiosError;
      throw new TapinError('Tapin document request failed', axiosError.response?.status, {
        code: axiosError.code,
      });
    }
  };

  const resource = <P extends Record<string, string>, C extends CapabilityGroup>(
    paths: P,
    capabilities: C,
  ): Resource<P, C> =>
    Object.fromEntries(
      Object.entries(paths).map(([name, path]) => [
        name,
        (input: JsonRecord = {}, callOptions: TapinRequestOptions = {}) => {
          const capability = capabilities[name];
          if (!capability)
            throw new TapinError(`Endpoint ${name} has no capability classification`);
          let finalPath = path;
          let finalInput = input;
          if (path.includes('{order_id}')) {
            const orderId = input.order_id;
            if (typeof orderId !== 'string' && typeof orderId !== 'number')
              throw new TypeError('order_id is required');
            finalPath = path.replace('{order_id}', encodeURIComponent(String(orderId)));
            finalInput = { ...input };
            delete finalInput.order_id;
          }
          return capability.response === 'document'
            ? requestDocument(finalPath, finalInput, callOptions, path as EndpointPath, input)
            : requestJson(path as EndpointPath, finalInput, callOptions, capability);
        },
      ]),
    ) as Resource<P, C>;

  const rawOrders = resource(endpointPaths.orders, endpointCapabilities.orders);
  const rawLocations = resource(endpointPaths.locations, endpointCapabilities.locations);
  const rawFinance = resource(endpointPaths.finance, endpointCapabilities.finance);
  const orders = {
    ...rawOrders,
    checkPrice: async (input: JsonRecord = {}, callOptions?: TapinRequestOptions) => {
      const response = await rawOrders.checkPrice(input, callOptions);
      const parsed = quoteResponseSchema.safeParse(response);
      if (!parsed.success)
        throw new TapinError(
          'Tapin quote response does not match the audited contract',
          undefined,
          { issues: parsed.error.issues },
        );
      return parsed.data;
    },
    register: (input: RegisterOrderInput, callOptions?: TapinRequestOptions) => {
      if ('register_type' in input)
        throw new TypeError('Use mode instead of the raw register_type code');
      const mode = registrationModeSchema.parse(input.mode);
      const providerInput: JsonRecord = { ...input };
      delete providerInput.mode;
      return requestJson(
        endpointPaths.orders.register,
        { ...providerInput, register_type: tapinCodes.registrationMode[mode] },
        callOptions ?? {},
        orderRegisterCapability(mode),
      ).then((response) => {
        const parsed = orderRegistrationResponseSchema.safeParse(response);
        if (!parsed.success)
          throw new TapinUnknownOutcomeError(
            'Tapin registered an order but returned an unrecognized response; reconcile by manual_id',
            { issues: parsed.error.issues },
          );
        return parsed.data;
      });
    },
  };
  return {
    runtime,
    orders,
    products: resource(endpointPaths.products, endpointCapabilities.products),
    shops: resource(endpointPaths.shops, endpointCapabilities.shops),
    locations: { ...rawLocations, fetchTree: rawLocations.tree },
    finance: { ...rawFinance, getBalance: rawFinance.credit },
    tasks: resource(endpointPaths.tasks, endpointCapabilities.tasks),
    customers: resource(endpointPaths.customers, endpointCapabilities.customers),
    employees: resource(endpointPaths.employees, endpointCapabilities.employees),
  };
}
export type TapinClient = ReturnType<typeof createTapinClient>;
export * from '../core.js';
export * from '../domain.js';
export * from '../error-codes.js';
export * from '../status.js';
export * from '../money.js';
export * from '../contracts.js';
export * from '../integration.js';
export * from './idempotency.js';
export * from './shipping.js';
export * from './tasks.js';
export * from './diagnostics.js';
