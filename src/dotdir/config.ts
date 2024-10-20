import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as ini from "ini";
import { randomUUID } from "crypto";

const configFileName = "config.ini";
type StrageType = "S3" | "google";

export interface S3Config {
  profile?: string; // AWS config file profile name
  bucket: string;
  region: string;
  prefixPath: string;
}

// Settingsの型定義
export interface Config {
  core: {
    localID: string;
    storageType: StrageType;
  };
  S3: S3Config;
}

const defaultConfig = `
[core]
    localID = ${crypto.randomUUID().toString()}
    storageType = S3

[S3]
    bucket = memoBucket
    region = us-east1 # ex: us-west-2, ap-northeast-1
    prefixPath = memo_repository
    profile = default                
`;

function getRootPath(): string {
  const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
  if (!workspaceFolder) {
    throw new Error("No workspace folder found.");
  }
  return workspaceFolder;
}

export async function createConfigFile(dirName: string): Promise<void> {
  const confDir = path.join(getRootPath(), dirName);
  const configFilePath = path.join(confDir, configFileName);
  const dirUri = vscode.Uri.joinPath(vscode.Uri.file(confDir));
  const configFileUri = vscode.Uri.joinPath(vscode.Uri.file(configFilePath));
  // exist check
  try {
    await vscode.workspace.fs.stat(dirUri);
  } catch {
    await vscode.workspace.fs.createDirectory(dirUri); // Create directory if it doesn't exist
  }
  try {
    await vscode.workspace.fs.stat(configFileUri); // ファイルの存在確認
  } catch {
    await vscode.workspace.fs.writeFile(vscode.Uri.file(configFilePath), Buffer.from(defaultConfig.trim(), "utf8"));
  }
  // Open the created file in the editor
  const document = await vscode.workspace.openTextDocument(configFilePath);
  await vscode.window.showTextDocument(document);
}

export async function loadConfig(dirName: string): Promise<Config> {
  const confDir = path.join(getRootPath(), dirName);
  const configFilePath = path.join(confDir, configFileName);
  const dirUri = vscode.Uri.joinPath(vscode.Uri.file(confDir));
  const configFileUri = vscode.Uri.joinPath(vscode.Uri.file(configFilePath));
  // 設定ファイルが存在するか確認
  try {
    await vscode.workspace.fs.stat(configFileUri);
  } catch {
    throw new Error("Config file not found.");
  }
  // INIファイルの内容を読み込む
  const configContent = await vscode.workspace.fs.readFile(configFileUri);
  // パース処理をトライキャッチでエラーハンドリング
  const parsedConfig: Config = ini.parse(configContent.toString()) as Config;
  return parsedConfig;
}
