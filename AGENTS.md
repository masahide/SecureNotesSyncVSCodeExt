# Repository Guidelines
## Project Structure & Module Organization
- Source: `src/` (entry: `src/extension.ts`); services in `container/`, factories in `factories/`, contracts in `interfaces/`, storage in `storage/`, configuration in `config/`.
- Views: `BranchTreeViewProvider.ts`, `IndexHistoryProvider.ts`.
- Tests: `src/test/` (unit, integration, VS Code host tests). Build output in `out/`; production bundle in `dist/`.
- Assets and docs: `assets/`, `docs/`.
## Build, Test, and Development Commands
- `npm run compile`: Bundle with webpack for development.
- `npm run watch`: Rebuild on file changes.
- `npm run package`: Production bundle with hidden source maps.
- `npm run lint`: ESLint over `src/`.
- `npm test` / `npm run test:headless`: Run VS Code tests (xvfb).
- `npm run test:local`: Run VS Code tests without xvfb.
- `npm run test:unit`: Fast TS-only tests via `tsx`.
## Coding Style & Naming Conventions
- Use TypeScript strict mode with 2-space indent and semicolons (Prettier configured).
- ESLint rules defined in `eslint.config.mjs`.
- For comprehensive patterns (imports, naming), see GEMINI.md → “Code Style & Patterns”.
## Testing Guidelines
- Locations: `src/test/` (unit, integration, VS Code host tests).
- Run: `npm test` (full), `npm run test:fast`, `npm run test:local`.
- Detailed practices and edge cases: see GEMINI.md → “Testing Guidelines” and “Testing Best Practices”.
## Commit & Pull Request Guidelines
- Commits: Prefer Conventional Commits (e.g., `feat(storage): add GitHub provider`).
- PRs: Clear description, linked issues, verification steps, and screenshots/GIFs for UI changes.
- Docs: Update `README.md` and `CHANGELOG.md` when changing commands, settings, or behavior.
## Security & Configuration Tips
- Never commit keys or decrypted content; `.secureNotes/` is runtime data.
- See GEMINI.md → “Security Considerations” and “Configuration Schema” for key handling and settings.
