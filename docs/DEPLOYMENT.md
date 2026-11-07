# Security and deployment guide

## Production prerequisites

1. Coordinate commercial API access with Tapin as required by its documentation.
2. Issue a least-privilege token and use Tapin's server-IP restriction when compatible with the deployment architecture.
3. Store tokens only as authenticated ciphertext or in a host vault. `createAesGcmCredentialVault` requires host-managed 32-byte keys and supports key IDs and rotation.
4. Import authenticated functionality only from `@hippogriffdev/tapin/node`, `@hippogriffdev/tapin/mongoose`, or `@hippogriffdev/tapin/nestjs`. Never serialize a client or token into frontend state.
5. Configure request timeouts, document size limits, bounded read retries, audit retention, and tenant/account isolation.

## Safe rollout order

1. Verify credentials using a read-only shop/account endpoint.
2. Read locations and reference resources.
3. Calculate a quote.
4. Register only a controlled `review` parcel with a unique `manual_id`.
5. Read it back, then edit/delete only when its current provider state permits.
6. Test `print_ready` or `send_ready` only after recording wallet cost, barcode consequences, the handoff plan, and cleanup ownership.
7. Test recharge, COD, returns, or other financial paths only as separately approved scenarios.

`TapinUnknownOutcomeError` means the request may have reached Tapin. Reconcile using `manual_id`, provider order ID, task ID, or another documented lookup before retrying. `TapinNotSentError` is reserved for failures proven to occur before transmission.

## MongoDB

Pass an existing connection to `createTapinModels`; the package never opens a hidden connection. Transactions require a replica set. Location activation stages and verifies the new dataset before atomically archiving the old active snapshot. Do not use TTL indexes for the sole active dataset.

Production connections commonly disable automatic index creation. Run `runTapinMigrations(models)` explicitly during a single-writer deployment step; version 1 creates the package indexes and records a checksum in `TapinSchemaMetadata`. Migrations are never run during import, installation, or ordinary client construction.

## Logging and privacy

Do not log authorization headers, full request/response bodies, addresses, phone numbers, national IDs, shipment contents, or financial payloads. Error metadata is intentionally limited to status/code/schema information. Host applications should apply their own structured redaction before forwarding errors to telemetry.
