# Release checklist

- [ ] Confirm `@hippogriffdev/tapin` is available on npm immediately before publication.
- [ ] Confirm commercial API authorization and package's unofficial description.
- [ ] Generate the official location snapshot with `TAPIN_TOKEN` and an explicit `TAPIN_LOCATIONS_FETCHED_AT`.
- [ ] Review added, removed, and renamed location codes.
- [ ] Run `npm run check:package` from a clean checkout.
- [ ] Confirm the disposable real MongoDB replica-set suite (`npm run test:replica`) passes.
- [ ] Inspect `npm pack --dry-run` for secrets and unexpected files.
- [ ] Confirm CI passes supported Node versions and all consumer subpaths.
- [ ] Review version and changelog.
- [ ] Create a signed release commit/tag.
- [ ] Publish only with explicit maintainer authorization using `npm publish --provenance --access public`.
- [ ] Install the published tarball in a clean project and smoke-test imports.

No credential verification, snapshot generation, Git push, GitHub release, or npm publication should be hidden inside installation scripts.
