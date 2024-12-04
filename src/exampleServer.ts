import { ServerOptions, WebSocket } from "ws"
import { createInMemoryFileSystem, Entry, InMemoryFileSystem } from "./util/inMemoryFileSystem"
import { messageFromWebSocketMessage, sendMessage as sendMessageCommon } from "./messageHelpers"
import {
  CreateDirectoryResponse,
  createDirectoryResponseSchema,
  DeleteResponse,
  deleteResponseSchema,
  FileStatus,
  ReadDirectoryResponse,
  readDirectoryResponseSchema,
  ReadFileResponse,
  readFileResponseSchema,
  RenameResponse,
  renameResponseSchema,
  StatusResponse,
  statusResponseSchema,
  WatchResponse,
  WriteFileResponse,
  writeFileResponseSchema,
} from "./fileSystemProtocol/responses"
import { allCommandsNarrowableSchema } from "./fileSystemProtocol/commands"
import { FileSystemError } from "vscode"
import { MessageType, Message, CommandMessage, ResponseMessage } from "./wireProtocol"

export function runExampleServer(options: ServerOptions): void {
  const fs = createInMemoryFileSystem()

  const wss = new WebSocket.Server(options)

  wss.on("connection", ws => {
    console.log("Server: New WebSocket connection")

    function sendMessage(message: Message): void {
      // console.log("Server: sending:", JSON.stringify(message));
      sendMessageCommon(ws, message)
    }

    ws.on("message", wsMessage => {
      const messageParseResult = messageFromWebSocketMessage(wsMessage)
      if (!messageParseResult.success) {
        console.error("Server: Error parsing message", messageParseResult.error)
        return
      }
      const { message } = messageParseResult

      try {
        switch (message.messageType) {
          case MessageType.Command:
            handleCommand(message)
            break
          default:
            throw new Error(`Unexpected message type: ${message.messageType}`)
        }
      } catch (error: unknown) {
        console.error("Server: Error handling command message", message.messageJson, error)
      }
    })

    ws.on("close", () => {
      console.log("Server: WebSocket connection closed")
    })

    ws.on("error", error => {
      console.log("Server: WebSocket error", error)
    })

    function getFullyParsedCommand(commandMessage: CommandMessage) {
      try {
        return allCommandsNarrowableSchema.parse(commandMessage)
      } catch (e: unknown) {
        console.error("Server: Error parsing command", e)
        throw e
      }
    }
    function handleCommand(commandMessage: CommandMessage) {
      const { command, message: fullyParsedMessage } = getFullyParsedCommand(commandMessage)

      switch (command) {
        case "watch":
          sendMessage(watch(fs, fullyParsedMessage.messageJson))
          break
        case "status":
          sendMessage(status(fs, fullyParsedMessage.messageJson))
          break
        case "readDirectory":
          sendMessage(readDirectory(fs, fullyParsedMessage.messageJson))
          break
        case "writeFile":
          sendMessage(writeFile(fs, fullyParsedMessage.messageJson, fullyParsedMessage.messageBinary))
          break
        case "createDirectory":
          sendMessage(createDirectory(fs, fullyParsedMessage.messageJson))
          break
        case "readFile":
          sendMessage(readFile(fs, fullyParsedMessage.messageJson))
          break
        case "rename":
          sendMessage(rename(fs, fullyParsedMessage.messageJson))
          break
        case "delete":
          sendMessage(deleteFile(fs, fullyParsedMessage.messageJson))
          break
        default:
          console.error("Server: Unhandled command", command)
          sendMessage(errorResponse("UnknownCommand", command))
          break
      }
    }
  })

  console.log("WebSocket server is listening on port 6666")
}

// Command handlers

function watch(
  fs: InMemoryFileSystem,
  { path, commandId, recursive, excludes }: { path: string; commandId: string; recursive: boolean; excludes: string[] },
): WatchResponse {
  console.log(`Watch for ${path} ${recursive} ${excludes} NYI`)
  // TODO: Has to return a disposable that cancels the subscription
  // This likely means I'll need to add an unwatch command
  return {
    messageType: MessageType.Response,
    messageJson: { success: true, commandId },
  }
}

function status(fs: InMemoryFileSystem, { commandId, path }: { commandId: string; path: string }): StatusResponse {
  const entry = fs.lookup(path)
  if (entry) {
    return {
      messageType: MessageType.Response,
      messageJson: {
        success: true,
        commandId,
        result: entryToFileState(entry),
      },
    }
  } else {
    return statusResponseSchema.parse(errorResponse("FileNotFound", commandId))
  }
}

function readDirectory(fs: InMemoryFileSystem, { commandId, path }: { commandId: string; path: string }): ReadDirectoryResponse {
  try {
    return {
      messageType: MessageType.Response,
      messageJson: {
        success: true,
        commandId,
        result: Array.from(fs.lookupDirectory(path, false).entries).map(([name, child]) => [name, child.type]),
      },
    }
  } catch (e: unknown) {
    return readDirectoryResponseSchema.parse(errorResponseFromError(e, commandId))
  }
}

function writeFile(
  fs: InMemoryFileSystem,
  { commandId, path, create, overwrite }: { commandId: string; path: string; create: boolean; overwrite: boolean },
  contents: Uint8Array | undefined,
): WriteFileResponse {
  try {
    return {
      messageType: MessageType.Response,
      messageJson: {
        success: true,
        commandId,
        created: fs.writeFile(path, contents ?? new Uint8Array(), {
          create,
          overwrite,
        }),
      },
    }
  } catch (e: unknown) {
    return writeFileResponseSchema.parse(errorResponseFromError(e, commandId))
  }
}

function createDirectory(fs: InMemoryFileSystem, { path, commandId }: { path: string; commandId: string }): CreateDirectoryResponse {
  try {
    fs.createDirectory(path)
    return {
      messageType: MessageType.Response,
      messageJson: { commandId, success: true },
    }
  } catch (e: unknown) {
    return createDirectoryResponseSchema.parse(errorResponseFromError(e, commandId))
  }
}

function readFile(fs: InMemoryFileSystem, { path, commandId }: { path: string; commandId: string }): ReadFileResponse {
  try {
    return {
      messageType: MessageType.Response,
      messageJson: {
        success: true,
        commandId,
      },
      messageBinary: fs.lookupFile(path).data,
    }
  } catch (e: unknown) {
    return readFileResponseSchema.parse(errorResponseFromError(e, commandId))
  }
}

function rename(
  fs: InMemoryFileSystem,
  { oldPath, newPath, overwrite, commandId }: { commandId: string; oldPath: string; newPath: string; overwrite: boolean },
): RenameResponse {
  try {
    fs.rename(oldPath, newPath, { overwrite })
    return {
      messageType: MessageType.Response,
      messageJson: {
        success: true,
        commandId,
      },
    }
  } catch (e: unknown) {
    return renameResponseSchema.parse(errorResponseFromError(e, commandId))
  }
}

function deleteFile(fs: InMemoryFileSystem, { path, commandId }: { commandId: string; path: string }): DeleteResponse {
  try {
    fs.deleteFile(path)
    return {
      messageType: MessageType.Response,
      messageJson: {
        success: true,
        commandId,
      },
    }
  } catch (e: unknown) {
    return deleteResponseSchema.parse(errorResponseFromError(e, commandId))
  }
}

// Helper functions

const entryToFileState = ({ type, ctime, mtime, size }: Entry): FileStatus => ({
  type,
  ctime,
  mtime,
  size,
})

function errorResponseFromError(error: unknown, commandId: string): ResponseMessage {
  if (error instanceof FileSystemError) {
    switch (error.code) {
      case "FileNotFound":
      case "FileExists":
      case "FileIsADirectory":
      case "NoPermissions":
        return errorResponse(error.code, commandId)
    }
  }
  // default
  throw error
}

function errorResponse(code: string, commandId: string): ResponseMessage {
  return {
    messageType: MessageType.Response,
    messageJson: {
      success: false,
      error: code,
      commandId,
    },
  }
}
