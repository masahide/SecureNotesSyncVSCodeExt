# Change Log

All notable changes to the "Secure Notes Sync" extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Docs: Architecture and sync flows documenting responsibility separation (Provider = Git I/O, SyncService = orchestration, LocalObjectManager = crypto/index).
- ESLint: Prohibit dynamic `import()` and `vscode.extensions.getExtension(...)` in `src/` (tests excluded).

### Changed
- DI Policy: Enforce obtaining services via container/locator; `workspaceUri` is mandatory for `LocalObjectManager`.

### Removed
- feat(storage)!: Remove crypto methods from `IStorageProvider`; provider handles Git I/O only.
- feat(provider)!: Remove encryption-related methods and arguments from `GithubProvider`.

### Breaking Changes
- `LocalObjectManager` constructor now requires only `workspaceUri` (no `context`/`encryptionKey`).
- All crypto/index operations receive `encryptionKey` and `environmentId` via options per call.
