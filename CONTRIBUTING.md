# Contributing

Use Node.js 18.18 or newer and install the locked dependencies with `npm ci`. Before opening a pull request, run:

```sh
npm run typecheck
npm test
npm run lint
npm run build
npm run browser:verify
npm run consumer:verify
```

Do not commit Tapin tokens, production payloads, addresses, phone numbers, national IDs, wallet data, or generated fixtures containing personal information. Provider contract changes must cite the current official documentation, preserve unknown fields, add a fixture/test, and update `docs/ENDPOINT_MATRIX.md`.

Location data changes must be generated with `npm run locations:sync`, reviewed as a diff, and pass `npm run locations:verify`. Mutating or financial live tests require isolated credentials and explicit approval; ordinary CI must never run them.
