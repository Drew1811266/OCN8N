# v2 Storage Adapter

**Goal:** Put v2 artifact persistence behind an adapter interface while keeping the default filesystem behavior unchanged.

## Scope

- Add `V2ArtifactStorage` with text read/write/list operations.
- Add default `V2FileArtifactStorage`.
- Inject the adapter into v2 plan, preview, registry, and run stores.
- Keep existing constructor behavior working with filesystem defaults.
- Export the adapter contract from the package entrypoint.
- Update public contract docs and tests.

## TDD Checklist

- [x] Add storage adapter interface and filesystem implementation.
- [x] Wire v2 plan, preview, registry, and run stores through the adapter.
- [x] Add an injected in-memory adapter test.
- [x] Export and document the adapter contract.
- [x] Run full verification before merge.
