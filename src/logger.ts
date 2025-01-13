import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel;

export function setOutputChannel(channel: vscode.OutputChannel) {
  outputChannel = channel;
}

// Log message to output channel
export function logMessage(message: string) {
  outputChannel.appendLine(message.trimEnd());
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
