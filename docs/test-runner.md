# Test Runner

## Overview

This repository no longer uses `mocha` or `@vscode/test-cli` for VS Code host tests.

- VS Code launch is handled by `@vscode/test-electron`
- Test discovery is handled by `src/test/extension-host-runner.ts`
- Test registration and execution compatibility are handled by `src/test/framework.ts`

## Supported APIs

The compatibility layer currently supports these global functions for `.test.ts` files:

- `suite(name, callback)`
- `test(name, callback)`
- `setup(callback)`
- `teardown(callback)`

These APIs are installed before test files are loaded, so most existing TDD-style test files can run without direct edits.

## Discovery Rules

- Compiled test files are loaded from `out/test/**/*.test.js`
- Files are sorted before loading to keep execution order stable
- `SECURE_NOTES_TEST_FILTER` can be used to restrict the loaded files to a substring match

## Commands

- `npm test`: full VS Code host test run under `xvfb-run`
- `npm run test:headless`: same as `npm test`
- `npm run test:local`: full VS Code host test run without `xvfb-run`
- `npm run test:sync`: filtered run for `SyncService.test.ts`
- `npm run test:unit`: TS-only unit test script compiled to `out/test/unit-test.js`

## Limitations

- `suiteSetup` and `suiteTeardown` are not implemented yet
- Full VS Code host execution depends on Electron support in the local environment
- In restricted sandboxes, Electron may terminate before tests start
