### Start of README.md

# Secure Notes Sync

A Visual Studio Code extension for securely managing and synchronizing notes (or other files) with a GitHub repository. Files are automatically encrypted with an AES key before being pushed and stored remotely. Supports branch-based synchronization and historical version management.

## Features

- **Secure Sync**: Encrypt notes/files in your workspace into a hidden `.secureNotes` folder and sync with GitHub.
- **Branch Management**: Create branches from specific historical indexes and switch between branches to manage different lines of development.
- **Auto-Sync**: Optionally sync on save or after periods of inactivity.
- **AES Key Management**:
  - Generate/store 32-byte AES keys (64 hex characters).
  - Retrieve keys from 1Password via CLI (optional).
  - Copy keys to clipboard or refresh cached keys.
- **Conflict Resolution**: Detect and resolve conflicts during merges.
- **Time Insertion**: Insert current date/time into active editors.
- **Tree View**: Visualize branches and historical indexes in the activity bar.

## Prerequisites

- Visual Studio Code (version 1.96.0+).
- Git installed and accessible in PATH.
- (Optional) [1Password CLI](https://developer.1password.com/docs/cli/) for AES key retrieval.

## Installation

1. Install from VS Code Marketplace.
2. Open/create a workspace folder for notes.
3. Ensure Git is installed.

## Quick Start

1. Open Command Palette (`Ctrl+Shift+P`/`Cmd+Shift+P`).
2. **Generate AES Key** or **Set AES Key** to configure encryption.
3. Set `SecureNotesSync.gitRemoteUrl` to your GitHub repo (e.g., `git@github.com:user/repo.git`).
4. Run **Sync Notes** to initialize the `.secureNotes` structure and push encrypted files.

## Commands

Search these in the Command Palette:

1. **Generate AES Key**  
   Creates a new 32-byte key stored in VS Code Secrets.

2. **Sync Notes**  
   Manually sync encrypted files with GitHub (pull, merge conflicts, push).

3. **Create Branch from Index**  
   Create a new branch from a selected historical index (right-click index in Tree View).

4. **Checkout Branch**  
   Switch branches, updating the workspace to the selected branch's state (right-click branch in Tree View).

5. **Copy AES Key**  
   Copy the AES key to your clipboard.

6. **Set AES Key**  
   Manually input/update the AES key.

7. **Refresh AES Key**  
   Force re-fetch the AES key from 1Password.

8. **Insert Current Time**  
   Add timestamp to the active editor.

## Configuration

Configure in VS Code settings (`File > Preferences > Settings`):

- **Git Remote URL** (`SecureNotesSync.gitRemoteUrl`)  
  GitHub repo URL for sync (e.g., `git@github.com:user/repo.git`).

- **Enable Auto-Sync** (`SecureNotesSync.enableAutoSync`)  
  Sync automatically on save/inactivity. Default: `false`.

- **Inactivity Timeout** (`SecureNotesSync.inactivityTimeoutSec`)  
  Seconds before auto-sync triggers after window blur. Default: `60`.

- **1Password URI** (`SecureNotesSync.onePasswordUri`)  
  `op://` URI to fetch AES key (e.g., `op://Vault/Item/password`).

- **1Password Account** (`SecureNotesSync.onePasswordAccount`)  
  (Optional) 1Password account name for CLI.

- **1Password Cache Timeout** (`SecureNotesSync.onePasswordCacheTimeout`)  
  Duration to cache AES keys from 1Password (e.g., `1h`, `30d`). Default: `30d`.

## Branch Management

- **View Branches**: The activity bar shows all branches under **Secure Notes Branches**.
- **Create Branch**: Right-click an index in the Tree View and select **Create Branch from Index**.
- **Checkout Branch**: Right-click a branch and choose **Checkout Branch** to switch contexts.
- Each branch maintains its own history of indexes, allowing parallel development.

## How It Works

1. Encrypted files and indexes are stored in `.secureNotes`, synced via Git.
2. **Sync Notes**:
   - Pulls remote changes and merges with local edits.
   - Resolves conflicts by prompting or saving remote versions as `conflict-*` files.
   - Pushes merged changes to GitHub.
3. **Branches**: Each branch references a chain of indexes. Checkout switches the workspace to that branch's latest state.

## Using 1Password

1. Set `onePasswordUri` to your key's `op://` URI.
2. The extension caches the key based on `onePasswordCacheTimeout`.
3. If retrieval fails, falls back to VS Code Secrets.

## Contributing

Issues/requests: [GitHub Repo](https://github.com/masahide/SecureNotesSyncVSCodeExt)

## License

See [LICENSE](https://github.com/masahide/SecureNotesSyncVSCodeExt/blob/main/LICENSE).

---

Secure your notes effortlessly with branch-aware encryption sync! ⚡🔒

### End of README.md
