# Encrypt Sync S3 VS Code Extension

## Overview

The **Encrypt Sync S3** extension allows users to sync notes between their local VS Code workspace and AWS S3. This includes encrypting the notes with AES encryption before uploading them to S3, as well as downloading and decrypting them for local use. It is ideal for anyone who needs a simple, secure way to back up and retrieve notes or any text documents using AWS S3.

## Features

- **Set AWS Credentials and AES Key**: Store your AWS credentials and AES encryption key securely using VS Code's SecretStorage feature.
- **Sync Notes with S3**: Encrypt and upload your workspace notes to S3 for secure storage.
- **Download and Decrypt Notes from S3**: Retrieve and decrypt notes from S3 back into your workspace.

## Prerequisites

- **AWS Account**: You need an active AWS account to create S3 buckets and upload/download notes.
- **VS Code Version**: Ensure you are using VS Code version `^1.50.0` or later.

## Setup

1. **Install Dependencies**: Run `npm install` in the project root to install all required dependencies.
2. **AWS Credentials**: Before you can sync your notes, you need to configure your AWS credentials and AES encryption key using the `Set AWS Credentials and AES Key` command.

## Commands

This extension provides the following commands that can be accessed through the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

1. **Set AWS Credentials and AES Key** (`extension.setCredentials`)

   - Prompts you to enter AWS Access Key ID, Secret Access Key, and a 32-character AES Encryption Key.
   - These are securely stored using VS Code's SecretStorage.

2. **Sync Notes with S3** (`extension.syncNotes`)

   - Encrypts all files in the current workspace and uploads them to your S3 bucket.
   - AES encryption ensures that your data remains private.

3. **Download and Decrypt Notes from S3** (`extension.downloadNotes`)
   - Downloads encrypted files from your S3 bucket, decrypts them, and stores them in the workspace.

## Usage

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
2. Run the command `Set AWS Credentials and AES Key` to configure your AWS credentials and AES encryption key.
3. Use `Sync Notes with S3` to upload your workspace notes to S3 with AES encryption.
4. Use `Download and Decrypt Notes from S3` to retrieve and decrypt your notes from S3.

## Security

- **AES Encryption**: Notes are encrypted using AES-256-CBC encryption. You need to provide a 32-character encryption key.
- **SecretStorage**: AWS credentials and the AES encryption key are stored securely using VS Code's SecretStorage feature.

## Development

To build and run the extension locally:

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Use the `F5` key in VS Code to open a new VS Code window with the extension loaded.

## Troubleshooting

- Ensure your **AWS credentials** and **AES encryption key** are set correctly using the `Set AWS Credentials and AES Key` command.
- If syncing or downloading fails, check the **AWS IAM permissions** for your S3 bucket to ensure you have sufficient privileges.

## Contribution

Feel free to submit pull requests or report issues. Contributions are welcome to enhance the extension and make it more efficient.

## License

This project is licensed under the MIT License.

## Contact

For support or suggestions, please open an issue on the project's GitHub repository.
