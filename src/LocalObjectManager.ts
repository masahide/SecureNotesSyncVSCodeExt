// LocalObjectManager.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

interface FileIndex {
    originalFile: string;
    encryptedFile: string;
}

interface IndexFile {
    files: FileIndex[];
}

export class LocalObjectManager {
    private static INDEX_FILE_NAME = "index.json";

    /**
     * 元ファイルを暗号化して .secureNotes に保存し、インデックスを更新する
     * @param originalFilePath 暗号化前のファイルパス
     * @param encryptionKey AES暗号化キー(16進64文字)
     * @returns 暗号化後ファイルのパス
     */
    public static saveEncryptedObject(originalFilePath: string, encryptionKey: string): string {
        // 元ファイル読込
        const content = fs.readFileSync(originalFilePath);

        // 暗号化
        const encrypted = this.encryptContent(content, encryptionKey);

        // 保存先パス (例: .secureNotes/xxxx.enc)
        const encryptedFileName = path.basename(originalFilePath) + ".enc";
        const encryptedFilePath = this.getLocalFilePath(encryptedFileName);
        fs.mkdirSync(path.dirname(encryptedFilePath), { recursive: true });
        fs.writeFileSync(encryptedFilePath, encrypted);

        // インデックスファイルを更新
        this.updateIndex(originalFilePath, encryptedFilePath);

        return encryptedFilePath;
    }

    /**
     * ダウンロードしてきた暗号化済みファイルをローカルに保存する(復号はここでは行わない)  
     * 必要に応じてインデックス更新も
     */
    public static storeEncryptedFile(encryptedFileName: string, data: Buffer) {
        const encryptedFilePath = this.getLocalFilePath(encryptedFileName);
        fs.mkdirSync(path.dirname(encryptedFilePath), { recursive: true });
        fs.writeFileSync(encryptedFilePath, data);
        // もしインデックスに追記したい場合はこのタイミングで行う
    }

    /**
     * ローカルにあるすべての暗号化ファイルを取得する
     */
    public static listLocalEncryptedFiles(): string[] {
        const folderPath = this.getNotesFolder();
        if (!fs.existsSync(folderPath)) {
            return [];
        }
        // ".enc" 拡張子のファイルを一通り取得 (再帰検索は省略)
        return fs
            .readdirSync(folderPath)
            .filter((f) => f.endsWith(".enc"))
            .map((f) => path.join(folderPath, f));
    }

    /**
     * インデックスファイルの読み込み（JSONを返す）
     */
    public static loadIndexFile(): IndexFile {
        const indexPath = this.getLocalFilePath(this.INDEX_FILE_NAME);
        if (!fs.existsSync(indexPath)) {
            return { files: [] };
        }
        const content = fs.readFileSync(indexPath, "utf-8");
        return JSON.parse(content) as IndexFile;
    }

    /**
     * インデックスファイルに1レコード追加または更新
     */
    private static updateIndex(originalFile: string, encryptedFile: string) {
        const indexData = this.loadIndexFile();

        // 既存レコードがあれば更新、なければ追加
        const existing = indexData.files.find((x) => x.originalFile === originalFile);
        if (existing) {
            existing.encryptedFile = encryptedFile;
        } else {
            indexData.files.push({ originalFile, encryptedFile });
        }

        this.saveIndexFile(indexData);
    }

    private static saveIndexFile(data: IndexFile) {
        const indexPath = this.getLocalFilePath(this.INDEX_FILE_NAME);
        fs.mkdirSync(path.dirname(indexPath), { recursive: true });
        fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
    }

    /**
     * .secureNotes フォルダパスを取得
     */
    private static getNotesFolder(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error("No workspace folder found.");
        }
        return path.join(workspaceFolders[0].uri.fsPath, ".secureNotes");
    }

    /**
     * .secureNotes 以下へのファイルパス生成
     */
    public static getLocalFilePath(fileName: string): string {
        return path.join(this.getNotesFolder(), fileName);
    }

    /**
     * 暗号化 (AES-256-CBC)
     */
    private static encryptContent(content: Buffer, key: string): Buffer {
        const iv = crypto.randomBytes(16);
        const keyBuffer = Buffer.from(key, "hex");
        const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);
        const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
        return Buffer.concat([iv, encrypted]);
    }

    /**
     * 復号化 (AES-256-CBC) - もしローカルで復号したいときに使用
     */
    public static decryptContent(encryptedContent: Buffer, key: string): Buffer {
        const iv = encryptedContent.subarray(0, 16);
        const encryptedText = encryptedContent.subarray(16);
        const keyBuffer = Buffer.from(key, "hex");
        const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
        return Buffer.concat([
            decipher.update(encryptedText),
            decipher.final(),
        ]);
    }
}
