### Start of README.md

# Secure Notes Sync

Secure Notes Sync is a Visual Studio Code extension that keeps sensitive notes under your control. All workspace files stay in plaintext locally while encrypted artifacts are synchronized to GitHub. AES-256-CBC encryption, `.secureNotes/` storage, and optional 1Password CLI integration provide explicit key management backed by Git-based observability.

## Design Principles

1. **Local Sovereignty**  
   Plaintext never leaves the workspace. GitHub (or any remote) only sees encrypted binaries, and deleting `.secureNotes/` removes all encrypted state.
2. **Explicit Encryption**  
   Each file is encrypted with AES-256-CBC using a per-file IV. Users decide how keys are sourced and are told when data is encrypted and with which key.
3. **Git as Audit Trail**  
   Git commits form an auditable history of encrypted objects. Every sync is traceable through index UUIDs aligned with Git branches.

## Key Capabilities

- AES-256-CBC encryption with per-file IVs and SHA-256 hashing for change detection.
- `.secureNotes/` staging area containing indexes, encrypted files, refs, and Git mirror.
- Integration with VS Code Secrets API or 1Password CLI for key retrieval and caching.
- Branch and index Tree Views (`BranchTreeViewProvider`, `IndexHistoryProvider`) for visibility into remote history.
- Auto-sync hooks on file save and window re-focus with configurable debounce timers.
- Conflict detection with automatic segregation of local, remote, and deleted artifacts (`conflict-local/`, `conflict-remote/`, `deleted-*`).
- Dedicated logging terminal plus VS Code notifications for success, warnings, and errors.

## Core Architecture

- `src/extension.ts`: Entry point. Bootstraps the DI container, resolves AES keys, registers commands and event handlers, and wires Tree Views.
- `src/container/` & `src/factories/`: Dependency injection infrastructure. `ContainerBuilder` registers default services; `ServiceLocator` exposes typed getters and manages disposal.
- `src/config/ConfigManager.ts`: Builds `SyncConfig` from VS Code settings, persists `environmentId` in `globalState`, and validates key sources.
- `src/SyncService.ts`: Orchestrates initialization, imports, incremental sync, conflict handling, and upload.
- `src/storage/LocalObjectManager.ts`: Maintains `IndexFile` and `FileEntry` metadata, performs encryption/decryption, manages branch refs, and reflects changes into the workspace.
- `src/storage/GithubProvider.ts`: Shells out to Git (`init`, `clone`, `fetch`, `reset`, `checkout`, `add`, `commit`, `push`) strictly for encrypted artifacts under `.secureNotes/remotes`.
- `src/BranchTreeViewProvider.ts` / `src/IndexHistoryProvider.ts`: Render branch lists and index history; respond to refreshes after sync.
- `src/logger.ts`: Routes structured log output to a dedicated terminal and bridges VS Code notification APIs.

### Dependency Injection Model

- `ServiceContainer` handles singleton vs. transient scopes.
- `ContainerBuilder.buildDefault(context)` registers core services; `LocalObjectManager` resolves lazily after initialization.
- `ServiceLocator` provides typed accessors such as `getConfigManager()` or `getSyncServiceFactory()` and offers `dispose()` for teardown.

## Data Model & Storage

```ts
interface FileEntry {
  path: string;
  hash: string; // SHA-256 of plaintext
  timestamp: number;
  deleted?: boolean;
}

interface IndexFile {
  uuid: string; // UUID v7
  environmentId: string;
  parentUuids: string[];
  files: FileEntry[];
  timestamp: number;
}
```

```
.secureNotes/
├── HEAD                 # Current branch name (plaintext)
├── wsIndex.json         # Latest index (plaintext JSON)
└── remotes/
    ├── refs/<branch>    # Encrypted branch refs mapped to index UUIDs
    ├── indexes/<uuid>   # Encrypted IndexFile objects
    ├── files/<hash>     # AES-256-CBC encrypted file payloads
    └── .git             # Git mirror used purely for encrypted artifacts
```

## Sync Flows

1. **Initialize New Storage (`secureNotes.initializeNewStorage`)**
   - Prepares `.secureNotes/remotes`, writes `.gitattributes` (`* binary`), generates an initial index, encrypts existing files, and pushes the first commit.
2. **Import Existing Storage (`secureNotes.importExistingStorage`)**
   - Clones the remote mirror, decrypts the latest index, restores workspace files, updates `.secureNotes/HEAD`, and refreshes Tree Views.
3. **Incremental Sync (`secureNotes.sync`)**
   - Fetches remote changes, rebuilds the local index, detects conflicts, prefers remote data while preserving local copies under `conflict-local/`, re-encrypts pending updates, refreshes workspace files, and pushes if there are new commits.

## Auto-Sync Triggers

- `onDidChangeWindowState`: If auto-sync is enabled and inactivity exceeds `inactivityTimeoutSec`, executes `secureNotes.sync`.
- `onDidSaveTextDocument`: Starts a debounce timer defined by `saveSyncTimeoutSec`; repeated saves reset the timer until sync executes.

## GitHub Provider Responsibilities

- Discovers Git binary via `which` or platform-specific fallbacks.
- Differentiates between fresh, empty, or existing remotes before initializing.
- Wraps Git commands with logging and error propagation using `execFile`.
- Ensures branch availability on upload (`git checkout <branch>` creating when necessary).

## Logging & Error Handling

- `logMessage*` methods colorize log output in a dedicated terminal.
- `showInfo` / `showError` surface user-facing notifications.
- `executeSyncOperation` wraps command handlers, guaranteeing controlled error reporting and consistent status returns.
- Development builds can register manual test commands via `registerManualSyncTestCommand`.

## Commands

Invoke via the Command Palette:

- **SecureNotes: Generate AES Key** — Create a new 32-byte key (64 hex chars) and store it in VS Code Secrets.
- **SecureNotes: Set AES Key** — Manually input or update the AES key.
- **SecureNotes: Copy AES Key** — Copy the current key to the clipboard.
- **SecureNotes: Refresh AES Key** — Re-fetch and cache the key from 1Password CLI.
- **SecureNotes: Initialize New Storage** — Encrypt current workspace files and push the inaugural commit.
- **SecureNotes: Import Existing Storage** — Clone encrypted artifacts and restore plaintext into the workspace.
- **SecureNotes: Sync** — Perform incremental sync (fetch, merge, encrypt, push).
- **SecureNotes: Create Branch from Index** — Spawn a new branch from a selected historical index.
- **SecureNotes: Checkout Branch** — Switch to another branch and reflect its state locally.
- **SecureNotes: Preview Index** — Inspect decrypted index JSON in an editor.
- **SecureNotes: Insert Current Time** — Insert the current timestamp into the active editor.

## Configuration

| Setting Key                                 | Type / Default | Description                                                      |
| ------------------------------------------- | -------------- | ---------------------------------------------------------------- |
| `SecureNotesSync.gitRemoteUrl`              | string         | GitHub repository URL used for encrypted artifact sync (required). |
| `SecureNotesSync.enableAutoSync`            | boolean / `false` | Enables auto-sync on save and inactivity triggers.               |
| `SecureNotesSync.inactivityTimeoutSec`      | number / `60`  | Seconds of inactivity after window focus loss before auto-sync.  |
| `SecureNotesSync.saveSyncTimeoutSec`        | number / `5`   | Delay in seconds before sync after a file save event.            |
| `SecureNotesSync.onePasswordUri`            | string         | `op://` URI pointing to the AES key in 1Password.                |
| `SecureNotesSync.onePasswordAccount`        | string         | Optional 1Password account name passed to the CLI.               |
| `SecureNotesSync.onePasswordCacheTimeout`   | string / `30d` | TTL for cached keys retrieved through 1Password CLI.             |

## Security Model

### Trust Boundaries

| Component                | Trust Level          | Primary Risk                              | Mitigation                                      |
| ------------------------ | -------------------- | ----------------------------------------- | ----------------------------------------------- |
| VS Code Workspace        | ✅ Trusted            | Physical compromise / malware             | Recommend OS-level disk encryption & backups.   |
| `.secureNotes/`          | ✅ Trusted            | IV reuse / accidental deletion            | Random IV generation and integrity checks.      |
| GitHub Repository        | ❌ Untrusted          | Account leakage / collaborator visibility | All artifacts are AES-encrypted before upload.  |
| 1Password CLI            | ✅ Trusted            | Vault breach / token compromise           | Account scoping and cache expiration controls.  |
| VS Code Secrets API      | ⚠️ Semi-Trusted       | Cross-device sync of secrets              | Cache duration limited (`onePasswordCacheTimeout`). |

### Threat Considerations

- **Remote repository leakage**: Only encrypted blobs exist remotely; AES keys stay local.
- **1Password session theft**: Cached CLI sessions expire per configured timeout; keys are also cached in VS Code Secrets separately.
- **Local malware**: Plaintext exists solely in the workspace; encourage full-disk encryption.
- **Sync conflicts**: Automated segregation of remote/local versions in dedicated conflict folders.
- **IV reuse**: Prevented via `crypto.randomBytes(16)` per file.
- **Key reuse across environments**: `environmentId` tags detect and warn about cross-environment key usage.

## Requirements & Setup

- Visual Studio Code 1.96.0 or later.
- Git available on PATH.
- Optional: [1Password CLI](https://developer.1password.com/docs/cli/) for secure key retrieval.

### Installation

1. Install the extension from the VS Code Marketplace.
2. Open or create a workspace for your notes.
3. Configure `SecureNotesSync.gitRemoteUrl` with your GitHub repository.

### Quick Start

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run **SecureNotes: Generate AES Key** or **SecureNotes: Set AES Key**.
3. (Optional) Configure 1Password settings if you want automatic key retrieval.
4. For a fresh repository, run **SecureNotes: Initialize New Storage**. To adopt an existing encrypted dataset, run **SecureNotes: Import Existing Storage**.
5. Use **SecureNotes: Sync** for manual or scheduled synchronization.

## Roadmap

- Add `secureNotes.rotateEncryptionKey` for key rotation and full re-encryption.
- Investigate migration to AES-GCM for authenticated encryption.
- Explore multi-device signature validation for index provenance.
- Introduce sensitivity tagging to vary encryption policies per note.

## License

See [LICENSE](https://github.com/masahide/SecureNotesSyncVSCodeExt/blob/main/LICENSE).

### End of README.md
