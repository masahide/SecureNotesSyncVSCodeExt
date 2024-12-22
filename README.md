# Secure Notes Sync VS Code Extension

## Overview

The **Secure Notes Sync** extension allows users to sync notes between their local VS Code workspace and various cloud storage providers. This includes encrypting the notes with AES encryption before uploading them to the cloud, as well as downloading and decrypting them for local use. It is ideal for anyone who needs a simple, secure way to back up and retrieve notes or any text documents using their preferred cloud storage.

## Features

- **Set Cloud Credentials and AES Key**: Store your cloud storage credentials and AES encryption key securely using VS Code's SecretStorage feature.
- **Sync Notes with Cloud Storage**: Encrypt and upload your workspace notes to your chosen cloud storage provider for secure storage.
- **Download and Decrypt Notes**: Retrieve and decrypt notes from cloud storage back into your workspace.

## Supported Cloud Storage Providers

- AWS S3 (Currently supported)
- Additional providers (Planned for future updates)

## Prerequisites

- **Cloud Account**: You need an active account for your chosen cloud storage provider.
- **VS Code Version**: Ensure you are using VS Code version `^1.50.0` or later.

## Setup

1. **Install Dependencies**: Run `npm install` in the project root to install all required dependencies.
2. **Cloud Credentials**: Before you can sync your notes, you need to configure your cloud storage credentials and AES encryption key using the `Set Cloud Credentials and AES Key` command.

## Commands

This extension provides the following commands that can be accessed through the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

1. **Set Cloud Credentials and AES Key** (`extension.setCredentials`)

   - Prompts you to enter cloud storage credentials and a 32-character AES Encryption Key.
   - These are securely stored using VS Code's SecretStorage.

2. **Sync Notes with Cloud Storage** (`extension.syncNotes`)

   - Encrypts all files in the current workspace and uploads them to your cloud storage.
   - AES encryption ensures that your data remains private.

3. **Download and Decrypt Notes** (`extension.downloadNotes`)

   - Downloads encrypted files from your cloud storage, decrypts them, and stores them in the workspace.

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
2. Run the command `Set Cloud Credentials and AES Key` to configure your cloud credentials and AES encryption key.
3. Use `Sync Notes with Cloud Storage` to upload your workspace notes to your chosen cloud storage with AES encryption.
4. Use `Download and Decrypt Notes` to retrieve and decrypt your notes from cloud storage.

## Security

- **AES Encryption**: Notes are encrypted using AES-256-CBC encryption. You need to provide a 32-character encryption key.
- **SecretStorage**: Cloud credentials and the AES encryption key are stored securely using VS Code's SecretStorage feature.

## Development

To build and run the extension locally:

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Use the `F5` key in VS Code to open a new VS Code window with the extension loaded.

## Troubleshooting

- Ensure your **cloud credentials** and **AES encryption key** are set correctly using the `Set Cloud Credentials and AES Key` command.
- If syncing or downloading fails, check the **permissions** for your cloud storage account to ensure you have sufficient privileges.

## Contribution

Feel free to submit pull requests or report issues. Contributions are welcome to enhance the extension and make it more efficient.

## License

This project is licensed under the MIT License.

## Contact

For support or suggestions, please open an issue on the project's GitHub repository.
