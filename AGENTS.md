# Repository Guidelines

## Project Structure & Module Organization

- Core extension code lives in `src/`, entry point at `src/extension.ts`.
- Services and IoC helpers are split across `container/`, `factories/`, `interfaces/`, `storage/`, and `config/` to keep dependencies explicit.
- View providers such as `BranchTreeViewProvider.ts` and `IndexHistoryProvider.ts` reside under `src/views`.
- Tests live in `src/test/` (unit, integration, host). Bundled output is written to `out/`, and production artifacts to `dist/`. Assets and docs sit in `assets/` and `docs/`.

## Build, Test, and Development Commands

- `npm run compile` — webpack build for local development.
- `npm run watch` — rebuild on file changes.
- `npm run package` — production bundle with hidden source maps.
- `npm run lint` — run ESLint on `src/`.
- `npm test` / `npm run test:headless` / `npm run test:local` / `npm run test:unit` — execute VS Code host or TS-only test suites as required.

## Coding Style & Naming Conventions

- TypeScript strict mode, 2-space indent, semicolons required; Prettier enforces formatting.
- ESLint rules in `eslint.config.mjs`; run `npm run lint -- --fix` for quick cleanups.
- Use descriptive PascalCase for classes, camelCase for functions, and CONSTANT_CASE for configuration keys.
- Group imports by module type as detailed in `GEMINI.md`; avoid default exports unless the module exports a single concern.

## Testing Guidelines

- Prefer TS-based unit tests compiled with `tsc` and executed from `out/test/`.
- Integration and VS Code host tests belong in `src/test/integration` and `src/test/suite`.
- Name specs with `.test.ts`; structure suite names to reflect feature and scenario (`suite('StorageService -> encrypt()', ...)`).
- VS Code host tests use the custom compatibility runner under `src/test/framework.ts` and are launched via `@vscode/test-electron`.
- Aim to cover error handling, telemetry, and file I/O edge cases; consult `GEMINI.md` for required fixtures.

## Commit & Pull Request Guidelines

- Use Conventional Commits (`feat(storage): add GitHub provider`, `fix(config): handle missing key`).
- Every PR should describe the change, link related issues, and document verification steps; attach screenshots or GIFs when UI changes occur.
- Update `README.md` and `CHANGELOG.md` when altering commands, settings, or user-visible behavior.

## Security & Configuration Tips

- Never commit secrets; `.secureNotes/` holds runtime-only data.
- Review `GEMINI.md` for secure key handling and configuration schema expectations.
- Validate that new configuration entries include schema docs and default fallbacks.
