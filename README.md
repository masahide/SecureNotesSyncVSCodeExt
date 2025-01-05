# Secure Notes Sync

A VSCode extension for securely syncing notes with a GitHub repository. Future plans include secure syncing with AWS S3 using AES-256 encryption.

## Features

- **GitHub Sync**: Securely sync notes with a GitHub repository.
- **Future Feature**: Secure sync with AWS S3 using AES-256 encryption (not yet implemented).
- **Auto Sync**: Automatically sync notes with GitHub on save with a customizable inactivity timeout.
- **Conflict Resolution**: Detect and resolve conflicts between local and remote files.

## Installation

1. **From VS Code Marketplace**:

   - Open VS Code.
   - Click on the extensions icon in the sidebar or press `Ctrl+Shift+X` (`Cmd+Shift+X` on macOS).
   - Search for "Secure Notes Sync" and click install.

2. **From Source**:
   - Clone the repository:
     ```bash
     git clone https://github.com/masahide/SecureNotesSyncVSCodeExt.git
     ```
   - Open the folder in VS Code.
   - Use the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and select "Extensions: Install Extension from VSIX..." then choose the `.vsix` package from the `dist` folder after building the project.

## Configuration

Configure the extension settings in your VS Code settings (`.vscode/settings.json` or through the settings UI):

```json
{
  "SecureNotesSync": {
    "awsAccessKeyId": "YOUR_AWS_ACCESS_KEY_ID", // Placeholder for future S3 integration
    "s3Bucket": "YOUR_S3_BUCKET_NAME", // Placeholder for future S3 integration
    "s3Region": "YOUR_S3_REGION", // Placeholder for future S3 integration
    "s3Endpoint": "YOUR_S3_ENDPOINT", // Placeholder for future S3 integration
    "s3PrefixPath": "YOUR_S3_PREFIX_PATH", // Placeholder for future S3 integration
    "gitRemoteUrl": "git@github.com:user/repo.git", // For GitHub sync
    "enableAutoSync": true,
    "inactivityTimeoutSec": 60
  }
}
```

## Usage

### Commands

- **Set AES Key**:

  - Command: `extension.setAESKey`
  - Prompts for your AES encryption key (64 hexadecimal characters).

- **Generate AES Key**:

  - Command: `extension.generateAESKey`
  - Generates a random 32-byte AES key and stores it securely.

- **Sync Notes**:

  - Command: `extension.syncNotes`
  - Encrypts local workspace files and saves them to the `.secureNotes` directory.

- **Sync with GitHub**:
  - Command: `extension.syncWithGitHub`
  - Synchronizes the encrypted files in the `.secureNotes` directory with the specified GitHub repository.

### Auto Sync

- When `enableAutoSync` is set to `true`, the extension will automatically sync your notes with GitHub after a period of inactivity defined by `inactivityTimeoutSec`.

## Known Issues and Limitations

- S3 sync functionality is not implemented yet.
- AWS configuration settings are placeholders and not used currently.
- Current sync functionality is only with GitHub repositories.

## Future Work

- Implement S3 sync functionality.
- Enhance security and performance.

## Contributing

- Contributions are welcome, especially for implementing S3 sync.
- Fork the repository and create a pull request for your changes.

## License

This extension is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contact

For questions or support, please open an issue on the [GitHub repository](https://github.com/masahide/SecureNotesSyncVSCodeExt).

---

**Note**: Ensure you have the necessary GitHub permissions configured correctly. AWS settings are placeholders and not used at this time.
