import { ClientRequestArgs } from "http"
import { isArrayBuffer } from "util/types"
import { ClientOptions, WebSocket } from "ws"
import { z } from "zod"
import * as Commands from "./fileSystemProtocol/commands"
import * as Responses from "./fileSystemProtocol/responses"
import { messageFromWebSocketMessage, sendMessage } from "./messageHelpers"
import { createDeferred, Deferred } from "./util/deferred"
import { MessageType, ResponseMessage, responseMessageSchema } from "./wireProtocol"

/**
 * Represents a client for interacting with a WebSocket-based file system provider.
 */
export type WebSocketClient = {
  /**
   * Watches for changes in the specified directory.
   * @param path - The path of the directory to watch.
   * @param recursive - Whether to watch directories recursively.
   * @param excludes - An array of paths to exclude from watching.
   * @returns A promise that resolves when the watch operation is set up.
   */
  watch: (path: string, recursive: boolean, excludes: string[]) => Promise<Responses.WatchResponse>

  /**
   * Retrieves the status of the specified path.
   * @param path - The path to check the status of.
   * @returns A promise that resolves with the status response.
   */
  status: (path: string) => Promise<Responses.StatusResponse>

  /**
   * Reads the contents of the specified directory.
   * @param path - The path of the directory to read.
   * @returns A promise that resolves with the directory contents.
   */
  readDirectory: (path: string) => Promise<Responses.ReadDirectoryResponse>

  /**
   * Creates a new directory at the specified path.
   * @param path - The path where the new directory should be created.
   * @returns A promise that resolves with the response of the create operation.
   */
  createDirectory: (path: string) => Promise<Responses.CreateDirectoryResponse>

  /**
   * Reads the contents of the specified file.
   * @param path - The path of the file to read.
   * @returns A promise that resolves with the file contents.
   */
  readFile: (path: string) => Promise<Responses.ReadFileResponse>

  /**
   * Writes content to the specified file.
   * @param path - The path of the file to write to.
   * @param create - Whether to create the file if it does not exist.
   * @param overwrite - Whether to overwrite the file if it already exists.
   * @param content - The content to write to the file.
   * @returns A promise that resolves with the response of the write operation.
   */
  writeFile: (path: string, create: boolean, overwrite: boolean, content: Uint8Array) => Promise<Responses.WriteFileResponse>

  /**
   * Deletes the specified file or directory.
   * @param path - The path of the file or directory to delete.
   * @returns A promise that resolves with the response of the delete operation.
   */
  delete: (path: string) => Promise<Responses.DeleteResponse>

  /**
   * Renames the specified file or directory.
   * @param oldPath - The current path of the file or directory.
   * @param newPath - The new path of the file or directory.
   * @param overwrite - Whether to overwrite the destination if it already exists.
   * @returns A promise that resolves with the response of the rename operation.
   */
  rename: (oldPath: string, newPath: string, overwrite: boolean) => Promise<Responses.RenameResponse>

  /**
   * Copies the specified file or directory to a new location.
   * @param sourcePath - The path of the file or directory to copy.
   * @param destinationPath - The destination path where the file or directory should be copied.
   * @param overwrite - Whether to overwrite the destination if it already exists.
   * @returns A promise that resolves with the response of the copy operation.
   */
  copy: (sourcePath: string, destinationPath: string, overwrite: boolean) => Promise<Responses.CopyResponse>
}

/**
 * Creates a WebSocket client that can communicate with a server using a specified address and options.
 *
 * @param {string | URL} address - The WebSocket server address. It can be a string or a URL object.
 * @param {ClientOptions | ClientRequestArgs} [options] - Optional configuration options for the WebSocket client.
 * @returns A {@link WebSocketClient} instance.
 */
export function createWebSocketClient(address: string | URL, options?: ClientOptions | ClientRequestArgs): WebSocketClient {
  let openWebSocketDeferred = createDeferred<void>()
  const pendingCommands = new Map<string, Deferred<ResponseMessage>>()

  const ws = new WebSocket(address, options)
  ws.binaryType = "arraybuffer"

  ws.on("open", () => {
    console.log("Client: WebSocket connection opened")
    openWebSocketDeferred.resolve()
  })

  ws.on("close", code => {
    openWebSocketDeferred = createDeferred<void>()
    console.log("Client: WebSocket connection closed", code)
  })

  ws.on("error", err => {
    console.log("Client: WebSocket connection error", err)
  })

  ws.addEventListener("message", ({ data }) => {
    if (!isArrayBuffer(data)) {
      throw new Error("Expected ArrayBuffer")
    }

    const messageParseResult = messageFromWebSocketMessage(data)
    if (!messageParseResult.success) {
      console.error("Client: Error parsing message", messageParseResult.error)
      return
    }
    const { message } = messageParseResult

    // console.log(`client received message:`, message);

    switch (message.messageType) {
      case MessageType.Response: {
        const responseMessage = responseMessageSchema.parse(message)
        const { commandId } = responseMessage.messageJson

        const pendingCommand = pendingCommands.get(commandId)
        if (!pendingCommand) {
          throw new Error(`No pending command for ${commandId}`)
        }
        pendingCommands.delete(commandId)
        pendingCommand.resolve(responseMessage)
        break
      }
      case MessageType.Event:
        throw Error("Not implemented")
      default:
        throw Error(`Unexpected message type: ${message.messageType}`)
    }
  })

  async function sendCommand<TSchema extends z.Schema<unknown>>(
    options: Commands.CommandCreationOptions,
    schema: TSchema,
  ): Promise<z.infer<TSchema>> {
    const commandMessage = Commands.createCommandMessage(options)
    await openWebSocketDeferred.promise
    sendMessage(ws, commandMessage)

    const deferred = createDeferred<ResponseMessage>()

    pendingCommands.set(commandMessage.messageJson.commandId, deferred)

    const result = await deferred.promise.then(jsonObjectAndBinary => {
      const parseResult = schema.safeParse(jsonObjectAndBinary)
      if (!parseResult.success) {
        console.error(`Failed to parse ${options.command} response`, options, jsonObjectAndBinary)
        throw new Error(parseResult.error.errors.map(e => e.message).join("\n"))
      }
      return parseResult.data
    })
    return result
  }

  return {
    watch: async (path: string, recursive: boolean, excludes: string[]) =>
      sendCommand({ command: "watch", path, recursive, excludes }, Responses.watchResponseSchema),

    status: async (path: string) => sendCommand({ command: "status", path }, Responses.statusResponseSchema),

    readDirectory: async (path: string) => sendCommand({ command: "readDirectory", path }, Responses.readDirectoryResponseSchema),

    createDirectory: async (path: string) => sendCommand({ command: "createDirectory", path }, Responses.createDirectoryResponseSchema),

    readFile: async (path: string) => sendCommand({ command: "readFile", path: path }, Responses.readFileResponseSchema),

    writeFile: async (path: string, create: boolean, overwrite: boolean, content: Uint8Array) =>
      sendCommand({ command: "writeFile", path, create, overwrite, binary: content }, Responses.writeFileResponseSchema),

    delete: async (path: string) => sendCommand({ command: "delete", path }, Responses.deleteResponseSchema),

    rename: async (oldPath: string, newPath: string, overwrite: boolean) =>
      sendCommand({ command: "rename", oldPath, newPath, overwrite }, Responses.renameResponseSchema),

    copy: async (sourcePath: string, destinationPath: string, overwrite: boolean) =>
      sendCommand({ command: "copy", sourcePath, destinationPath, overwrite }, Responses.copyResponseSchema),
  }
}
