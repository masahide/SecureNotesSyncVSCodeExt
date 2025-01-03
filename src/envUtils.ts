// src/envUtils.ts
import * as vscode from "vscode";
import * as os from "os";
import * as crypto from "crypto";

const ENV_ID_KEY = "encryptSyncEnvironmentId";

export async function getOrCreateEnvironmentId(context: vscode.ExtensionContext): Promise<string> {
    let envId = context.globalState.get<string>(ENV_ID_KEY);
    if (!envId) {
        const hostname = os.hostname();
        envId = `${hostname}-${crypto.randomUUID()}`;
        await context.globalState.update(ENV_ID_KEY, envId);
    }
    return envId;
}
