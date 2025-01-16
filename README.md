# Secure Notes Sync

A Visual Studio Code extension for securely managing and synchronizing notes (or other files) with a GitHub repository. Files are automatically encrypted with an AES key before being pushed and stored remotely.

## Features

- Encrypt notes/files in your workspace into a hidden `.secureNotes` folder.
- Sync encryption changes to a remote GitHub repository.
- Auto-sync based on inactivity (optional).
- AES key management:
  - Generate a new 32-byte AES key (64 hex characters).
  - Retrieve the AES key from 1Password (optional).
  - Copy the AES key to the clipboard.
- Conflict detection and resolution when merging remote and local changes.
- Insert current date/time into the active editor.

## Prerequisites

- Visual Studio Code (version 1.96.0 or higher).
- Git must be installed and available in your PATH.
- (Optional) [1Password CLI](https://developer.1password.com/docs/cli/) (op) if you want to automatically retrieve the AES encryption key from 1Password.

## Installation

1. Install the extension from the VS Code Marketplace (or download and install the .vsix file manually).
2. Open (or create) a workspace folder where you want to store your notes.
3. Make sure Git is installed and accessible in your environment.

## Quick Start

After installing the extension, follow these steps to get started:

1. Open your command palette (Ctrl+Shift+P on Windows/Linux, Cmd+Shift+P on macOS).
2. Run "Set AES Key" to add your existing 32-byte key (in 64 hex characters), or "Generate AES Key" to create a new one.
3. Configure "SecureNotesSync.gitRemoteUrl" with your GitHub repository URL (e.g., <git@github.com>:username/repo.git).
4. Run the "Sync Notes" command to push your encrypted files to the remote repository.

## Commands

All commands are available in the Command Palette (Ctrl+Shift+P / Cmd+Shift+P). Search for them by name:

1. **Generate AES Key** (extension.generateAESKey)  
   Generates a new random 32-byte key for encryption and saves it in VS Code Secrets.

2. **Sync Notes** (extension.syncNotes)  
   Manually triggers synchronization with your configured GitHub repository.  
   - Pulls remote changes, merges them, and resolves conflicts if any.  
   - Pushes local encrypted notes/files to GitHub.

3. **Copy AES Key to Clipboard** (extension.copyAESKeyToClipboard)  
   Copies your AES encryption key from VS Code Secrets to your clipboard.

4. **Set AES Key** (extension.setAESKey)  
   Allows you to input or update a custom AES key (64 hex characters).

5. **Refresh AES Key** (extension.refreshAESKey)  
   Forces retrieval of the AES key from 1Password again, overwriting the local cached key.

6. **Insert Current Time** (extension.insertCurrentTime)  
   Inserts the current date and time into the currently active editor at the cursor.

## Configuration

All configuration settings can be found under "Secure Notes Sync" in your VS Code settings. You can modify them by going to "File → Preferences → Settings" (or "Code → Preferences → Settings" on macOS) and searching for "Secure Notes Sync":

- **SecureNotesSync.gitRemoteUrl** (string)
  GitHub repository URL for syncing the object directory.  
  Example: <git@github.com>:username/secure-notes-repo.git

- **SecureNotesSync.enableAutoSync** (boolean)  
  Whether to enable auto-sync whenever there is an inactivity pause. Default: false.

- **SecureNotesSync.inactivityTimeoutSec** (number)  
  Inactivity timeout in seconds for auto-sync. Once the editor detects no user activity for this duration, it will trigger a sync if auto-sync is enabled. Default: 60.

- **SecureNotesSync.onePasswordUri** (string)
  If set to an op:// URI, the AES key will be retrieved via the 1Password CLI. For example:  
  op://Vault/Item/password

- **SecureNotesSync.onePasswordAccount** (string)
  (Optional) The 1Password account name to use with the op CLI. Useful if you have multiple 1Password accounts.

## How It Works

1. The extension looks for (or creates) a `.secureNotes` folder inside your workspace. This folder holds the encrypted files and indexes.
2. When you "Sync Notes," changes from the remote are fetched and merged.  
   - If files differ both locally and remotely, you’ll be prompted to resolve conflicts.  
   - Resolved versions are then encrypted locally under `.secureNotes`.
3. Once the merge is resolved, changes are committed and pushed back to your configured GitHub remote.
4. If "enableAutoSync" is turned on, the extension will monitor user activity. After the specified inactivity timeout, it will run the "Sync Notes" command automatically.

## Conflict Resolution

If the same file changed both locally and remotely, you'll see a prompt in VS Code offering three options:

1. Keep Local Version  
2. Keep Remote Version  
3. Save Remote Version as a Conflict File (you’ll see a new file with a "conflict-..." timestamp in its name)

Choose whichever option is appropriate. The extension then updates or preserves your local workspace accordingly.

## Using 1Password CLI

If you have set "SecureNotesSync.onePasswordUri" to an op://... URI, the extension will attempt to retrieve the AES key from the 1Password CLI:

1. If the key has already been fetched within the last 30 days, the extension uses the cached version.
2. Otherwise, it will run the op CLI in the background to retrieve a fresh copy.  
3. If retrieving the key fails, the extension falls back to the key stored in VS Code Secrets (if any).

Make sure the "op" command is installed and on your PATH. Also, you may need to be authenticated in 1Password CLI (e.g., run "op signin").

## Tips

- Keep your repository private to ensure your encrypted data remains confidential.  
- If you need to share the repository with others, you must also securely share the AES key or have them retrieve it via 1Password.
- If you accidentally commit your raw AES key (never do this!), rotate it immediately.

## Contributing

Feel free to submit issues or feature requests via GitHub:
[SecureNotesSyncVSCodeExt on GitHub](https://github.com/masahide/SecureNotesSyncVSCodeExt)

## License

This project is licensed under the terms specified in the repository. Check the [LICENSE](https://github.com/masahide/SecureNotesSyncVSCodeExt/blob/main/LICENSE) file for more details.

---

Thank you for using Secure Notes Sync! If you find this extension helpful, rating and sharing it with others is greatly appreciated. Keep your notes safe and synchronized!
