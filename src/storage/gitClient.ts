import * as cp from "child_process";
import { logMessage, logMessageRed } from "../logger";

export interface GitCommandOptions {
  cwd: string;
  silent?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface IGitClient {
  exec(args: string[], options: GitCommandOptions): Promise<{ stdout: string; stderr: string }>;
}

export class NodeGitClient implements IGitClient {
  constructor(private readonly gitPath: string) {}

  exec(args: string[], options: GitCommandOptions): Promise<{ stdout: string; stderr: string }> {
    const { cwd, silent = false, env } = options;
    if (!silent) {
      logMessage(`Executing: ${this.gitPath} ${args.join(" ")} in ${cwd}`);
    }
    return new Promise((resolve, reject) => {
      cp.execFile(this.gitPath, args, { cwd, env }, (error, stdout, stderr) => {
        if (error) {
          if (!silent) {
            logMessageRed(`Execution failed: ${error}`);
          }
          reject(new Error(`execFile error:${this.gitPath} ${args.join(" ")} \nstdout: '${stdout}'\nstderr: '${stderr}'`));
        } else {
          if (!silent) {
            if (stdout) {
              logMessage(`stdout: ${stdout}`);
            }
            if (stderr) {
              logMessageRed(`stderr: ${stderr}`);
            }
          }
          resolve({ stdout, stderr });
        }
      });
    });
  }
}
