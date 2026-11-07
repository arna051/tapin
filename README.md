# tapin

Unofficial TypeScript integration for the [Tapin shipping API](https://docs.tapin.ir/), with intentional exports for core contracts, browser-safe location helpers, Node.js, Mongoose, NestJS, and testing.

> This project is not affiliated with or endorsed by Tapin. Tapin's documentation says commercial API users must coordinate with Tapin before production use.

## Install

```sh
npm install tapin
```

```ts
import { createTapinClient } from 'tapin/node';
const tapin = createTapinClient({ token: process.env.TAPIN_TOKEN! });
const shops = await tapin.shops.list({ count: 20, page: 1 });

// Registration mode is mandatory. Raw register_type is rejected.
const parcel = await tapin.orders.register({
  mode: 'review',
  shop_id: 'shop-id',
  manual_id: 'merchant-order-123',
  address: 'Receiver address',
  province_code: 1,
  city_code: 1,
  first_name: 'Receiver',
  last_name: 'Name',
  mobile: '09121111111',
  phone: null,
  email: null,
  postal_code: '1313131313',
  employee_code: -1,
  pay_type: 1,
  order_type: 1,
  packet_type: 2,
  box_id: 10,
  package_weight: 100,
  products: [
    { title: 'Product', count: 1, price: 100_000, discount: 0, weight: 500, product_id: null },
  ],
});
```

Never expose a Tapin token in browser code. `tapin/browser` contains only public data and helpers; authenticated operations live in `tapin/node`. Mutating calls are never retried automatically: a timeout produces `TapinUnknownOutcomeError` and must be reconciled before retrying.

## Exports

- `tapin` — provider-neutral contracts, endpoint inventory, errors and safety metadata
- `tapin/browser` — immutable location snapshot and Persian search helpers
- `tapin/node` — authenticated Axios client covering documented resource groups
- `tapin/mongoose` — connection-scoped location models (no hidden connection)
- `tapin/nestjs` — `TapinModule.forRoot` / `forRootAsync`; optional admin and public
  controllers are disabled by default and require a host-provided authorizer and handlers
- `tapin/testing` — deterministic fake transport and fixture helpers

Document-producing order methods return bounded server-side streams rather than buffering entire PDFs or HTML responses:

```ts
const label = await tapin.orders.label({ shop_id: 'shop-id', orders: ['provider-order-uuid'] });
label.stream.pipe(destination);
```

The package classifies every endpoint as a read, mutation, financial/irreversible operation, or document response. `endpointContracts` labels each path as field-audited, envelope-only, or stream-validated; this avoids pretending Tapin's prose-only documentation provides schemas it does not. See the [endpoint matrix](./docs/ENDPOINT_MATRIX.md). Mutations with ambiguous transport outcomes raise `TapinUnknownOutcomeError`; callers must reconcile before retrying. The `executeIdempotent` helper accepts an atomic host-supplied store and rejects same-key/different-request reuse.

`createTapinShippingService` provides normalized quote inputs with explicit IRR, grams, provider-code mapping, package-specific weight limits, and an injectable clock. Raw resource methods remain available so documented provider fields are never hidden. Tracking helpers preserve every raw status while separating delivery, workflow, and financial meanings.

`tapin/mongoose` exports all schemas against a caller-supplied `Connection`; it never opens a connection. Credential tokens are represented as authenticated ciphertext and can use `createAesGcmCredentialVault` with host-managed 32-byte keys and key rotation. It also provides durable idempotency reservations, bounded outbox runners, sync-cursor leases, versioned location activation, and `loadLocations` with explicit bundled/Mongoose/live source selection.

Maintainers can run `npm run test:replica` to create a disposable local MongoDB replica set and verify real transactions, unique indexes, outbox lease fencing, and parcel status history. It requires local `mongod` and `mongosh` binaries and never connects to a production database.

`diagnoseTapinError` returns redacted access, transport, and unknown-outcome guidance without copying request bodies, credentials, personal information, or provider payloads into telemetry.

Use `verifyTapinAccount(client)` for credential checks. It performs one bounded, read-only shop-list request and cannot create a parcel, assign a barcode, deduct wallet credit, or create a payment link.

## Important limitations

Tapin publishes prose documentation rather than an OpenAPI schema. The documentation currently conflicts on authorization formatting and the shape of `state/tree/`, and does not fully specify file response types. The client defaults to a bare `Authorization` token, supports `authorizationScheme: 'JWT'`, validates every JSON envelope and field-validates the paths marked `audited`, preserves raw `entries`, and does not invent undocumented fields.

The bundled location file is deliberately empty in source until a maintainer runs `TAPIN_TOKEN=... npm run locations:sync`, reviews the generated diff, and runs `npm run locations:verify`. Publication must not proceed while that verification fails.

## Release

1. Confirm the npm name with `npm view tapin` immediately before publishing.
2. Generate and review the official location snapshot.
3. Run `npm run check:package` and inspect `npm pack --dry-run`.
4. Confirm commercial API authorization with Tapin.
5. Publish only with explicit maintainer approval: `npm publish --provenance --access public`.

See [SECURITY.md](./SECURITY.md) before handling credentials or personal shipment data.
Also review the [deployment guide](./docs/DEPLOYMENT.md), [release checklist](./docs/RELEASE_CHECKLIST.md), and [contribution policy](./CONTRIBUTING.md).
