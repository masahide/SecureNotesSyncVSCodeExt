# GEMINI.md - AI Development Assistant Guidelines

## Project Overview

**Secure Notes Sync** is a Visual Studio Code extension that provides secure, encrypted synchronization of notes and files with GitHub repositories. The extension uses AES-256-CBC encryption, branch-based version control, and supports integration with 1Password for key management.

## AI Assistant Guidelines

### Project Context
- **Language**: TypeScript
- **Framework**: VS Code Extension API
- **Build System**: Webpack + TypeScript
- **Architecture**: Modular design with storage providers, encryption, and UI components
- **Security Focus**: AES encryption, secure key management, encrypted Git storage

### Key Technical Areas

#### 1. Encryption & Security
- **Algorithm**: AES-256-CBC with random IV per file
- **Key Management**: 64-character hex strings (32 bytes)
- **Storage**: Encrypted files in `.secureNotes/remotes/` with hash-based paths
- **Integration**: 1Password CLI support for enterprise key retrieval

#### 2. Version Control Model
- **Index Files**: JSON structures with UUID v7, parent references, file metadata
- **Branch References**: Encrypted UUID pointers in `.secureNotes/remotes/refs/`
- **Workspace Tracking**: `wsIndex.json` for current state, `HEAD` for current branch
- **Conflict Resolution**: Automatic merge with conflict file creation

#### 3. File Organization
```
.secureNotes/
├── HEAD                           # Current branch name
├── wsIndex.json                   # Current workspace index
└── remotes/
    ├── refs/                      # Branch references (encrypted UUIDs)
    ├── indexes/                   # Encrypted index files (UUID-based paths)
    └── files/                     # Encrypted file content (hash-based paths)
```

### Development Guidelines for AI Assistance

#### Code Style & Patterns
- Use TypeScript strict mode with proper type definitions
- Follow ESLint rules in `eslint.config.mjs`
- Prefer `async/await` over Promise chains
- Use VS Code's workspace API for file operations
- Implement proper error handling with the logger module

#### Security Considerations
- Never log or expose AES keys in plain text
- Use VS Code secrets API for sensitive data storage
- Validate all user inputs, especially file paths and encryption keys
- Ensure proper IV generation for each encryption operation

#### Extension Architecture
- Register commands in `activate()` function
- Use `context.subscriptions.push()` for proper cleanup
- Leverage tree view providers for UI components
- Implement storage providers following the `IStorageProvider` interface

#### File Naming Conventions
- Hash-based file paths: first 2 characters as directory, remainder as filename
- UUID-based index paths: first 6 characters as directory, remainder as filename
- Use relative paths for workspace files
- Maintain consistent encryption/decryption patterns

### Common Development Tasks

#### Adding New Commands
1. Define command in `package.json` contributes section
2. Register command handler in `extension.ts` activate function
3. Add to context subscriptions for proper cleanup
4. Implement error handling and user feedback

#### Storage Operations
1. Use `LocalObjectManager` for local encryption/decryption
2. Use `GithubProvider` for remote Git operations
3. Follow the storage provider interface pattern
4. Handle conflicts gracefully with user notification
5. Handle Git operation failures gracefully, allowing the process to continue where possible.

#### UI Components
1. Extend `BranchTreeViewProvider` for tree view modifications
2. Use VS Code's built-in UI components (QuickPick, InputBox)
3. Provide clear user feedback for long-running operations
4. Implement proper loading states and error messages

### Testing Guidelines
- Use VS Code Test Framework for extension testing
- Test encryption/decryption operations thoroughly
- Mock external dependencies (Git, 1Password CLI)
- Test error conditions and edge cases
- Verify proper cleanup of resources

### Configuration Management
- All settings prefixed with `SecureNotesSync.`
- Required: `gitRemoteUrl` for GitHub repository
- Optional: Auto-sync, 1Password integration, timeouts
- Validate configuration values before use
- Provide clear error messages for invalid configurations

### Error Handling Patterns
- Use the logger module for consistent error reporting
- Show user-friendly messages via `showError()` function
- Log detailed error information for debugging
- Gracefully handle network failures and Git errors, preventing the application from crashing.
- Provide recovery suggestions when possible

### Performance Considerations
- Cache AES keys with configurable timeouts
- Use efficient file hashing (SHA-256)
- Implement incremental sync operations
- Avoid blocking the UI thread for long operations
- Use VS Code's progress API for user feedback

## AI Assistant Best Practices

### When Helping with Code Changes
1. Always understand the security implications of changes
2. Maintain the existing architecture patterns
3. Follow TypeScript best practices and type safety
4. Test encryption/decryption operations thoroughly
5. Consider backward compatibility with existing data

### When Adding Features
1. Follow the modular architecture design
2. Add appropriate configuration options
3. Implement proper error handling and logging
4. Update documentation and command descriptions
5. Consider security and performance implications

### When Debugging Issues
1. Check the "SecureNoteSync Log" terminal for detailed logs
2. Verify `.secureNotes` directory structure and permissions
3. Test with different Git configurations and network conditions
4. Validate AES key format and accessibility
5. Check VS Code extension host logs for additional context

## Resources

- **VS Code Extension API**: https://code.visualstudio.com/api
- **Node.js Crypto Module**: For AES encryption implementation
- **Git CLI**: For repository operations and conflict resolution
- **1Password CLI**: For enterprise key management integration
- **UUID v7**: For timestamp-ordered unique identifiers

## Notes for AI Assistants

This project prioritizes security and user data protection. When suggesting changes:
- Always consider the security implications
- Maintain the encryption-first approach
- Preserve existing data compatibility
- Follow the established patterns for error handling
- Test thoroughly with encrypted data scenarios

The codebase is well-structured with clear separation of concerns. The storage layer is abstracted to allow for different providers (currently GitHub), and the encryption layer ensures all sensitive data is protected before storage.