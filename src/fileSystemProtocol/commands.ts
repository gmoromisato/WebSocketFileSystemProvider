import { z } from "zod"
import { CommandMessage, commandMessageSchema, MessageType } from "../wireProtocol"
import { v4 as uuidV4 } from "uuid"

// Path only commands (status, readDirectory, createDirectory, readFile, delete)
export const pathOnlyCommandSchema = commandMessageSchema.extend({
  messageJson: commandMessageSchema.shape.messageJson
    .extend({
      command: z.enum(["status", "readDirectory", "createDirectory", "readFile", "delete"]),
      path: z.string(),
    })
    .strict(),
  messageBinary: z.never().optional(),
})
export type PathOnlyCommand = z.infer<typeof pathOnlyCommandSchema>
const pathOnlyCommandNarrowableSchema = pathOnlyCommandSchema.transform(full => ({
  command: full.messageJson.command,
  message: full,
}))

// Watch
export const watchCommandSchema = commandMessageSchema.extend({
  messageJson: commandMessageSchema.shape.messageJson
    .extend({
      command: z.literal("watch"),
      path: z.string(),
      recursive: z.boolean(),
      excludes: z.string().array(),
    })
    .strict(),
  messageBinary: z.never().optional(),
})
export type WatchCommand = z.infer<typeof watchCommandSchema>
const watchCommandNarrowableSchema = watchCommandSchema.transform(full => ({
  command: full.messageJson.command,
  message: full,
}))

// Rename
export const renameCommandSchema = commandMessageSchema.extend({
  messageJson: commandMessageSchema.shape.messageJson
    .extend({
      command: z.literal("rename"),
      oldPath: z.string(),
      newPath: z.string(),
      overwrite: z.boolean(),
    })
    .strict(),
  messageBinary: z.never().optional(),
})
export type RenameCommand = z.infer<typeof renameCommandSchema>
const renameCommandNarrowableSchema = renameCommandSchema.transform(full => ({
  command: full.messageJson.command,
  message: full,
}))

// Copy
export const copyCommandSchema = commandMessageSchema.extend({
  messageJson: commandMessageSchema.shape.messageJson
    .extend({
      command: z.literal("copy"),
      sourcePath: z.string(),
      destinationPath: z.string(),
      overwrite: z.boolean(),
    })
    .strict(),
  messageBinary: z.never().optional(),
})
export type CopyCommand = z.infer<typeof copyCommandSchema>
const copyCommandNarrowableSchema = copyCommandSchema.transform(full => ({
  command: full.messageJson.command,
  message: full,
}))

// writeFile
export const writeFileCommandSchema = commandMessageSchema.extend({
  messageJson: commandMessageSchema.shape.messageJson
    .extend({
      command: z.literal("writeFile"),
      path: z.string(),
      create: z.boolean(),
      overwrite: z.boolean(),
    })
    .strict(),
  messageBinary: z.instanceof(Uint8Array).optional(),
})
export type WriteFileCommand = z.infer<typeof writeFileCommandSchema>

const writeFileCommandNarrowableSchema = writeFileCommandSchema.transform(full => ({
  command: full.messageJson.command,
  message: full,
}))

export const allCommandsNarrowableSchema = z.union([
  pathOnlyCommandNarrowableSchema,
  watchCommandNarrowableSchema,
  writeFileCommandNarrowableSchema,
  renameCommandNarrowableSchema,
  copyCommandNarrowableSchema,
])
export type AllCommandsNarrowable = z.infer<typeof allCommandsNarrowableSchema>

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const allCommandsSchema = z.union([
  pathOnlyCommandSchema,
  watchCommandSchema,
  writeFileCommandSchema,
  renameCommandSchema,
  copyCommandSchema,
])
export type AllCommands = z.infer<typeof allCommandsSchema>

// Command creation helpers

type CommandOptionsWithoutBinary<T extends CommandMessage> = Omit<T["messageJson"], "commandId"> & {
  binary?: never
}
type CommandOptionsWithBinary<T extends CommandMessage> = Omit<T["messageJson"], "commandId"> & {
  binary: Uint8Array
}

export type CommandCreationOptions =
  | CommandOptionsWithoutBinary<WatchCommand>
  | CommandOptionsWithoutBinary<PathOnlyCommand>
  | CommandOptionsWithBinary<WriteFileCommand>
  | CommandOptionsWithoutBinary<RenameCommand>
  | CommandOptionsWithoutBinary<CopyCommand>

export const createCommandMessage = (options: CommandCreationOptions): AllCommands => {
  const commandId = uuidV4()

  if (options.binary) {
    const { binary, ...rest } = options
    return {
      messageType: MessageType.Command,
      messageJson: { commandId, ...rest },
      messageBinary: binary,
    }
  } else {
    // TODO: I just can't get the inference correct
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return {
      messageType: MessageType.Command,
      messageJson: { commandId, ...options },
    } as AllCommands
  }
}
