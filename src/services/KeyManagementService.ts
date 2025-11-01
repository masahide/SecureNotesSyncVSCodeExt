import * as vscode from "vscode";
import { execFile } from "child_process";
import which from "which";
import * as config from "../config";
import { IKeyManagementService } from "../interfaces/IKeyManagementService";
import { logMessage } from "../logger";

const AES_ENCRYPTION_KEY = "aesEncryptionKey";
const AES_ENCRYPTION_KEY_FETCHED_TIME = "aesEncryptionKeyFetchedTime";

export class KeyManagementService implements IKeyManagementService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getKey(
    options: { forceRefresh?: boolean } = {},
  ): Promise<string | undefined> {
    if (options.forceRefresh) {
      await this.invalidateCache();
    }

    const opUri = config.getOnePasswordUri();
    if (!opUri.startsWith("op://")) {
      return (await this.context.secrets.get(AES_ENCRYPTION_KEY)) ?? undefined;
    }

    const cachedKey = await this.context.secrets.get(AES_ENCRYPTION_KEY);
    const cachedTimeStr = await this.context.secrets.get(
      AES_ENCRYPTION_KEY_FETCHED_TIME,
    );
    if (cachedKey && cachedTimeStr && !options.forceRefresh) {
      const cachedTime = parseInt(cachedTimeStr, 10);
      if (
        !isNaN(cachedTime) &&
        Date.now() - cachedTime <
          parseTimeToMs(config.getOnePasswordCacheTimeout())
      ) {
        return cachedKey;
      }
    }

    const fetched = await this.fetchKeyFromOnePassword(opUri);
    if (fetched) {
      await this.saveKey(fetched);
      await this.markKeyFetched();
      return fetched;
    }

    return cachedKey ?? undefined;
  }

  async saveKey(key: string): Promise<void> {
    await this.context.secrets.store(AES_ENCRYPTION_KEY, key);
  }

  async invalidateCache(): Promise<void> {
    await this.context.secrets.store(AES_ENCRYPTION_KEY_FETCHED_TIME, "0");
  }

  async refreshKey(): Promise<string | undefined> {
    await this.invalidateCache();
    const refreshed = await this.getKey({ forceRefresh: true });
    if (refreshed) {
      await this.markKeyFetched();
    }
    return refreshed;
  }

  async markKeyFetched(timestamp: number = Date.now()): Promise<void> {
    await this.cacheFetchTimestamp(timestamp);
  }

  private async fetchKeyFromOnePassword(
    opUri: string,
  ): Promise<string | undefined> {
    try {
      const opPath = which.sync("op");
      const account = config.getOnePasswordAccount();
      const key = await this.readKeyViaCli(opPath, account, opUri);
      if (key && key.length === 64) {
        return key;
      }
    } catch (error) {
      logMessage(
        `KeyManagementService: failed to fetch key from 1Password. ${String(error)}`,
      );
    }
    return undefined;
  }

  private async cacheFetchTimestamp(timestamp: number): Promise<void> {
    await this.context.secrets.store(
      AES_ENCRYPTION_KEY_FETCHED_TIME,
      timestamp.toString(),
    );
  }

  private readKeyViaCli(
    opPath: string,
    account: string,
    opUri: string,
  ): Promise<string> {
    const args = account
      ? ["--account", account, "read", opUri]
      : ["read", opUri];
    return new Promise((resolve, reject) => {
      execFile(opPath, args, (error, stdout, stderr) => {
        if (error) {
          return reject(
            `Error running op CLI: ${error.message}, stderr: ${stderr}`,
          );
        }
        const key = stdout.trim();
        if (!key) {
          return reject("op CLI returned empty string.");
        }
        resolve(key);
      });
    });
  }
}

function parseTimeToMs(timeStr: string): number {
  const match = timeStr.match(/(\d+)([smhd])/);
  if (!match) {
    return 2592000000; // 30 days
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 2592000000;
  }
}
