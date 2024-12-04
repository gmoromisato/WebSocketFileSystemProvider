import * as path from "path"
import * as vscode from "vscode"
import { createWebSocketClient } from "./webSocketClient"
import { runExampleServer } from "./exampleServer"

export class WebSocketFS implements vscode.FileSystemProvider {
  client = createWebSocketClient("ws://localhost:6666")

  constructor() {
    runExampleServer({ host: "localhost", port: 6666 })
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    return this.client.status(uri.path).then(({ messageJson }) => {
      return messageJson.success ? messageJson.result : throwExceptionForErrorCode(messageJson.error, uri)
    })
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    return this.client
      .readDirectory(uri.path)
      .then(({ messageJson }) => (messageJson.success ? messageJson.result : throwExceptionForErrorCode(messageJson.error, uri)))
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    return this.client.readFile(uri.path).then(response => {
      return response.messageBinary ? response.messageBinary : throwExceptionForErrorCode(response.messageJson.error, uri)
    })
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array, { create, overwrite }: { create: boolean; overwrite: boolean }): Promise<void> {
    const { messageJson } = await this.client.writeFile(uri.path, create, overwrite, content)
    if (!messageJson.success) {
      throwExceptionForErrorCode(messageJson.error, uri)
    }
    if (messageJson.created) {
      this._fireSoon({ type: vscode.FileChangeType.Created, uri })
    }
    this._fireSoon({ type: vscode.FileChangeType.Changed, uri })
  }

  // --- manage files/folders

  async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
    const result = await this.client.rename(oldUri.path, newUri.path, options.overwrite)
    if (!result.messageJson.success) {
      throwExceptionForErrorCode(result.messageJson.error, oldUri)
    }

    this._fireSoon({ type: vscode.FileChangeType.Deleted, uri: oldUri }, { type: vscode.FileChangeType.Created, uri: newUri })
  }

  async delete(uri: vscode.Uri): Promise<void> {
    const { messageJson } = await this.client.delete(uri.path)
    if (!messageJson.success) {
      throwExceptionForErrorCode(messageJson.error, uri)
    }
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    // console.log(`createDirectory: ${uri}`);
    const { messageJson } = await this.client.createDirectory(uri.path)
    if (!messageJson.success) {
      throwExceptionForErrorCode(messageJson.error, uri)
    }

    this._fireSoon(
      {
        type: vscode.FileChangeType.Changed,
        uri: uri.with({ path: path.posix.dirname(uri.path) }),
      },
      { type: vscode.FileChangeType.Created, uri },
    )
    console.log(
      `createDirectory: SUCCESS - changed ${uri.with({
        path: path.posix.dirname(uri.path),
      })}`,
    )
  }

  // --- lookup

  // --- manage file events

  private readonly _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
  private readonly _bufferedEvents: vscode.FileChangeEvent[] = []
  private _fireSoonHandle?: NodeJS.Timeout

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event

  watch(/*_resource: vscode.Uri*/): vscode.Disposable {
    // ignore, fires for all changes...
    return new vscode.Disposable(() => {})
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
}

function throwExceptionForErrorCode(code: "FileNotFound" | "NoPermissions" | "FileExists", uri: vscode.Uri): never {
  switch (code) {
    case "FileNotFound":
      throw vscode.FileSystemError.FileNotFound(uri)
    case "FileExists":
      throw vscode.FileSystemError.FileExists(uri)
    case "NoPermissions":
      throw vscode.FileSystemError.NoPermissions(uri)
  }
}
