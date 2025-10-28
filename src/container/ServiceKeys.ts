// src/container/ServiceKeys.ts

/**
 * サービスキーの定数定義
 * 型安全なサービス解決のための定数
 */
export const ServiceKeys = {
  // Core Services
  SYNC_SERVICE_FACTORY: "syncServiceFactory",

  // Storage Services
  STORAGE_PROVIDER: "storageProvider",
  GITHUB_PROVIDER: "githubProvider",
  LOCAL_OBJECT_MANAGER: "localObjectManager",

  // Configuration Services
  CONFIG_MANAGER: "configManager",
  ENCRYPTION_KEY: "encryptionKey",
  KEY_MANAGEMENT_SERVICE: "keyManagementService",
  FILE_SYSTEM: "fileSystem",
  GIT_CLIENT: "gitClient",
  LAYOUT_MANAGER: "layoutManager",

  // UI Services
  BRANCH_PROVIDER: "branchProvider",
  WORKSPACE_CONTEXT: "workspaceContext",

  // Context Services
  EXTENSION_CONTEXT: "extensionContext",

  // Utility Services
  LOGGER: "logger",
  ENCRYPTION_SERVICE: "encryptionService",
} as const;

/**
 * サービスキーの型定義
 */
export type ServiceKey = (typeof ServiceKeys)[keyof typeof ServiceKeys];
