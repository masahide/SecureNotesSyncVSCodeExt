import * as vscode from "vscode";

const appName = "SecureNotesSync";

function getConfig() {
  return vscode.workspace.getConfiguration(appName);
}

export function getGitRemoteUrl(): string | undefined {
  return getConfig().get<string>("gitRemoteUrl");
}

export function isAutoSyncEnabled(): boolean {
  return getConfig().get<boolean>("enableAutoSync", false);
}

export function getInactivityTimeoutSec(): number {
  return getConfig().get<number>("inactivityTimeoutSec", 60);
}

export function getSaveSyncTimeoutSec(): number {
  return getConfig().get<number>("saveSyncTimeoutSec", 5);
}

export function getOnePasswordUri(): string {
  return getConfig().get<string>("onePasswordUri") || "";
}

export function getOnePasswordAccount(): string {
  return getConfig().get<string>("onePasswordAccount") || "";
}

export function getOnePasswordCacheTimeout(): string {
  return getConfig().get<string>("onePasswordCacheTimeout", "30d");
}
