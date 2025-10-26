import path from "path";
import { EventEmitter as NodeEventEmitter } from "events";

type VsCodeModule = typeof import("vscode");

class StubEventEmitter<T> {
  private readonly emitter = new NodeEventEmitter();
  public readonly event = (listener: (value: T) => void) => {
    this.emitter.on("event", listener);
    return { dispose: () => this.emitter.off("event", listener) };
  };
  fire(value: T): void {
    this.emitter.emit("event", value);
  }
  dispose(): void {
    this.emitter.removeAllListeners();
  }
}

function createStub(): VsCodeModule {
  const Uri = {
    file: (p: string) => ({ fsPath: path.resolve(p) }) as any,
    joinPath: (base: { fsPath: string }, ...segments: string[]) =>
      ({ fsPath: path.join(base.fsPath, ...segments) }) as any,
  };

  const workspace = {
    fs: {
      writeFile: async () => undefined,
      delete: async () => undefined,
      createDirectory: async () => undefined,
    },
  };

  const window = {
    createTerminal: () => ({ show: () => undefined }),
    showErrorMessage: () => undefined,
    showInformationMessage: () => undefined,
  };

  return {
    Uri,
    workspace,
    window,
    EventEmitter: StubEventEmitter,
    Terminal: class {},
    Pseudoterminal: class {},
    TerminalDimensions: class {},
  } as unknown as VsCodeModule;
}

let cached: VsCodeModule | undefined;

export function getVscode(): VsCodeModule {
  if (!cached) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      cached = require("vscode") as VsCodeModule;
    } catch {
      cached = createStub();
    }
  }
  return cached;
}
