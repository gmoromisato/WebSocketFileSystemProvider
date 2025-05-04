import * as path from "path"
import * as vscode from "vscode"
import { createWebSocketClient, WebSocketClient } from "./webSocketClient"
import { runExampleServer } from "./exampleServer"

export type Credentials = {
  user: string;
  pass: string;
}

type GridWhaleError =
  | "FileNotFound"
  | "NoPermissions"
  | "FileExists"
  | "Unauthorized"
  | 401;

export class WebSocketFS implements vscode.FileSystemProvider {
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

  private readonly client: Promise<WebSocketClient>; // lazily resolved
//  private _fireSoonHandle: NodeJS.Timeout | undefined;

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly authority: string,
    { devServer = false }: { devServer?: boolean } = {},
  ) {
    this.onDidChangeFile = this._emitter.event;

    if (devServer) {
      runExampleServer({ host: "localhost", port: 6666 });
    }

    // Kick off the async WebSocket creation (includes credential lookup).
    this.client = this.createClient();
  }

  // ---------------------------------------------------------------------------
  // File operations
  // ---------------------------------------------------------------------------

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const client = await this.client;
    const { messageJson } = await client.status(uri.path);
    return messageJson.success
      ? messageJson.result
      : this.throwFor(messageJson.error as GridWhaleError, uri);
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const client = await this.client;
    const { messageJson } = await client.readDirectory(uri.path);
    return messageJson.success
      ? messageJson.result
      : this.throwFor(messageJson.error as GridWhaleError, uri);
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const client = await this.client;
    const { messageBinary, messageJson } = await client.readFile(uri.path);
    return messageBinary ?? this.throwFor(messageJson.error as GridWhaleError, uri);
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    { create, overwrite }: { create: boolean; overwrite: boolean },
  ): Promise<void> {
    const client = await this.client;
    const { messageJson } = await client.writeFile(uri.path, create, overwrite, content);

    if (!messageJson.success) {
      this.throwFor(messageJson.error as GridWhaleError, uri);
    }

    if (messageJson.created) {
      this._fireSoon({ type: vscode.FileChangeType.Created, uri });
    }
    this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
  }

  // --- manage files/folders

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    { overwrite }: { overwrite: boolean },
  ): Promise<void> {
    const client = await this.client;
    const { messageJson } = await client.rename(oldUri.path, newUri.path, overwrite);

    if (!messageJson.success) {
      this.throwFor(messageJson.error as GridWhaleError, oldUri);
    }

    this._fireSoon(
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri },
    );
  }

  async delete(uri: vscode.Uri): Promise<void> {
    const client = await this.client;
    const { messageJson } = await client.delete(uri.path);
    if (!messageJson.success) {
      this.throwFor(messageJson.error as GridWhaleError, uri);
    }
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    const client = await this.client;
    const { messageJson } = await client.createDirectory(uri.path);

    if (!messageJson.success) {
      this.throwFor(messageJson.error as GridWhaleError, uri);
    }

    const parent = uri.with({ path: path.posix.dirname(uri.path) });
    this._fireSoon(
      { type: vscode.FileChangeType.Changed, uri: parent },
      { type: vscode.FileChangeType.Created, uri },
    );
  }

  // --- lookup

  // --- manage file events

  private readonly _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
  private readonly _bufferedEvents: vscode.FileChangeEvent[] = []
  private _fireSoonHandle?: NodeJS.Timeout

  watch(/*_resource: vscode.Uri*/): vscode.Disposable {
    // ignore, fires for all changes...
    return new vscode.Disposable(() => {})
  }

// ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async credentials(): Promise<Credentials> {
    const raw = await this.secrets.get(`gw:${this.authority}`);
    if (!raw) throw vscode.FileSystemError.NoPermissions("Not signed in");

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(raw);
    }

  private async authHeader(): Promise<Record<string, string>> {
    const { user, pass } = await this.credentials();
    const token = Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
    return { Authorization: `Basic ${token}` };
  }

  private async createClient(): Promise<WebSocketClient> {
    const headers = await this.authHeader();
    // `ws` expects `OutgoingHttpHeaders`; our Record<string,string> fits.
    return createWebSocketClient(`wss://${this.authority}/ws/RCWPLD85`, { headers });
  }

  private _fireSoon(...events: vscode.FileChangeEvent[]): void {
    this._bufferedEvents.push(...events)

    if (this._fireSoonHandle) {
      clearTimeout(this._fireSoonHandle)
    }

    this._fireSoonHandle = setTimeout(() => {
      this._emitter.fire(this._bufferedEvents)
      this._bufferedEvents.length = 0
    }, 5)
  }

  private throwFor(code: GridWhaleError, uri: vscode.Uri): never {
    switch (code) {
      case "FileNotFound":
        throw vscode.FileSystemError.FileNotFound(uri);
      case "FileExists":
        throw vscode.FileSystemError.FileExists(uri);
      case "NoPermissions":
      case "Unauthorized":
      case 401:
        throw vscode.FileSystemError.NoPermissions(uri);
      default:
        throw vscode.FileSystemError.Unavailable(uri);
    }
  }
}

