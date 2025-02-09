import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel;

export function setOutputChannel(channel: vscode.OutputChannel) {
  outputChannel = channel;
}

/**
 * 現在のローカル日時を ISO 8601 形式 (例: 2023-11-03T15:28:05+07:00) で返す
 */
function getLocalISOStringWithOffset(date: Date = new Date()): string {
  const pad = (n: number) => n < 10 ? '0' + n : n;
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  // getTimezoneOffset() は分単位 (UTCとの差。東側なら負の値)
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const offsetHours = pad(Math.floor(Math.abs(offset) / 60));
  const offsetMinutes = pad(Math.abs(offset) % 60);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHours}:${offsetMinutes}`;
}

// Log message を出力する際にタイムスタンプを行頭に追加
export function logMessage(message: string) {
  const timestamp = getLocalISOStringWithOffset();
  outputChannel.appendLine(`${timestamp} ${message.trimEnd()}`);
}

// Show error message and log
export function showError(message: string) {
  vscode.window.showErrorMessage(message);
  logMessage(message);
}

// Show info message and log
export function showInfo(message: string) {
  vscode.window.showInformationMessage(message);
  logMessage(message);
}