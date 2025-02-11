import * as vscode from "vscode";

let outputTerminal: vscode.Terminal;
let pty: MyPseudoterminal;

class aMyPseudoterminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  public onDidWrite: vscode.Event<string> = this.writeEmitter.event;

  // 端末が開かれたときに呼ばれる
  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    // 初期メッセージの出力
    this.writeEmitter.fire('SecureNoteSync Log terminal started\r\n');
  }

  // 端末が閉じられたときに呼ばれる
  close(): void {
    // クリーンアップ処理などがあればここに記述
  }
}

class MyPseudoterminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  public onDidWrite: vscode.Event<string> = this.writeEmitter.event;

  // open が呼ばれる前の出力をバッファリングするための配列
  private buffer: string[] = [];
  // open が呼ばれたかどうかを示すフラグ
  private isOpen: boolean = false;

  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    // 初期メッセージの出力（\r\n でキャリッジリターンも入れる）
    this.isOpen = true;
    // open 時にバッファの内容をフラッシュする
    if (this.buffer.length > 0) {
      // 複数の文字列を連結して一度に出力
      this.buffer.forEach(text => this.write(text));
      this.buffer = [];
    }
  }

  // 外部から文字列を出力するためのメソッド
  public write(text: string): void {
    if (this.isOpen) {
      text = text.replace(/\r\n/g, '\n');
      text = text.trimEnd();
      text = text.replace(/\n/g, '\r\n');
      this.writeEmitter.fire(`${text}\r\n`);
    } else {
      // open が呼ばれる前に出力された文字列はバッファに追加
      this.buffer.push(text);
    }
  }

  close(): void {
    // 必要に応じたクリーンアップ処理
  }
}

export function showOutputTerminal(terminalName: string) {
  pty = new MyPseudoterminal();
  outputTerminal = vscode.window.createTerminal({ name: terminalName, pty });
  outputTerminal.show();
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


// ANSIカラーコードの定義
const ANSI_COLORS = {
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m'
};

// カラー表示関数
function colorText(text: string, color: string): string {
  return `${color}${text.trimEnd()}${ANSI_COLORS.RESET}`;
}

// Log message を出力する際にタイムスタンプを行頭に追加
export function logMessage(message: string) {
  const timestamp = getLocalISOStringWithOffset();
  pty.write(`${timestamp} ${message}`);
}

export function logMessageRed(message: string) {
  logMessage(colorText(message, ANSI_COLORS.RED));
}
export function logMessageGreen(message: string) {
  logMessage(colorText(message, ANSI_COLORS.GREEN));
}
export function logMessageYellow(message: string) {
  logMessage(colorText(message, ANSI_COLORS.YELLOW));
}
export function logMessageBlue(message: string) {
  logMessage(colorText(message, ANSI_COLORS.BLUE));
}

// Show error message and log
export function showError(message: string) {
  vscode.window.showErrorMessage(message);
  logMessageRed(message);
}

// Show info message and log
export function showInfo(message: string) {
  vscode.window.showInformationMessage(message);
  logMessageGreen(message);
}