import { z } from "zod"
import { responseMessageSchema } from "../wireProtocol"

// Types

export const FilePermission = {
  Readonly: 1,
  SomeFuturePermission: 2,
} as const

const fileStatusSchema = z.object({
  /** *Note:* This value is a bitmask of `FileType`'s, e.g. `FileType.File | FileType.SymbolicLink`. */
  type: z.number().int(),
  ctime: z.number(),
  mtime: z.number(),
  size: z.number(),
  /** *Note:* This value is a bitmask of `FilePermission`'s, e.g. `FilePermission.Readonly | FilePermission.Other`. */
  permissions: z.number().int().optional(),
})
export type FileStatus = z.infer<typeof fileStatusSchema>

export const FileType = {
  Unknown: 0,
  File: 1,
  Directory: 2,
  SymbolicLink: 64,
} as const
export const fileTypeSchema = z.union([
  z.literal(FileType.Unknown),
  z.literal(FileType.File),
  z.literal(FileType.Directory),
  z.literal(FileType.SymbolicLink),
])
export type FileType = z.infer<typeof fileTypeSchema>

// Schemas and stuff
export const voidSuccessResponseSchema = responseMessageSchema
  .extend({
    messageJson: responseMessageSchema.shape.messageJson
      .extend({
        success: z.literal(true),
      })
      .strict(),
  })
  .omit({ messageBinary: true })
  .strict()
export type VoidSuccessResponse = z.infer<typeof voidSuccessResponseSchema>

const errorResponse = <T extends z.Schema<unknown>>(errorSchema: T) =>
  responseMessageSchema
    .extend({
      messageJson: responseMessageSchema.shape.messageJson
        .extend({
          success: z.literal(false),
          error: errorSchema,
        })
        .strict(),
      // Leave message binary in the type as messageBinary?: undefined to make userland code and narrowing easier
      messageBinary: z.never().optional(),
    })
    .strict()

const fileNotFoundResponseSchema = errorResponse(z.literal("FileNotFound"))
export type FileNotFoundResponse = z.infer<typeof fileNotFoundResponseSchema>

const fileExistsResponseSchema = errorResponse(z.literal("FileExists"))
export type FileExistsResponse = z.infer<typeof fileExistsResponseSchema>

export const fileIsADirectoryResponseSchema = errorResponse(z.literal("FileIsADirectory"))
export type FileIsADirectoryResponse = z.infer<typeof fileIsADirectoryResponseSchema>

const noPermissionsResponseSchema = errorResponse(z.literal("NoPermissions"))
export type NoPermissionsResponse = z.infer<typeof noPermissionsResponseSchema>

// File System Provider responses

// watch
export const watchResponseSchema = voidSuccessResponseSchema
export type WatchResponse = z.infer<typeof watchResponseSchema>

// status
export const statusSuccessResponseSchema = responseMessageSchema
  .extend({
    messageJson: responseMessageSchema.shape.messageJson
      .extend({
        success: z.literal(true),
        result: fileStatusSchema,
      })
      .strict(),
  })
  .omit({ messageBinary: true })
  .strict()
export type StatusSuccessResponse = z.infer<typeof statusSuccessResponseSchema>
export const statusResponseSchema = z.union([statusSuccessResponseSchema, fileNotFoundResponseSchema])
export type StatusResponse = z.infer<typeof statusResponseSchema>

// readDirectory
export const readDirectorySuccessResponseSchema = responseMessageSchema
  .extend({
    messageJson: responseMessageSchema.shape.messageJson
      .extend({
        success: z.literal(true),
        result: z.tuple([z.string(), fileTypeSchema]).array(),
      })
      .strict(),
  })
  .omit({ messageBinary: true })
  .strict()
export type ReadDirectorySuccessResponse = z.infer<typeof readDirectorySuccessResponseSchema>
export const readDirectoryResponseSchema = z.union([readDirectorySuccessResponseSchema, fileNotFoundResponseSchema])
export type ReadDirectoryResponse = z.infer<typeof readDirectoryResponseSchema>

// createDirectory
export const createDirectorySuccessResponseSchema = voidSuccessResponseSchema
export type CreateDirectorySuccessResponse = z.infer<typeof createDirectorySuccessResponseSchema>
export const createDirectoryResponseSchema = z.union([
  createDirectorySuccessResponseSchema,
  fileNotFoundResponseSchema,
  fileExistsResponseSchema,
  noPermissionsResponseSchema,
])
export type CreateDirectoryResponse = z.infer<typeof createDirectoryResponseSchema>

// readFile
export const readFileSuccessResponseSchema = responseMessageSchema.extend({
  messageJson: responseMessageSchema.shape.messageJson
    .extend({
      success: z.literal(true),
    })
    .strict(),
  messageBinary: responseMessageSchema.shape.messageBinary
    // Although the vscode is happy to send undefined the contents of an empty file, it's not happy to receive it.
    .default(() => new Uint8Array()),
})
export type ReadFileSuccessResponse = z.infer<typeof readFileSuccessResponseSchema>
export const readFileResponseSchema = z.union([readFileSuccessResponseSchema, fileNotFoundResponseSchema])
export type ReadFileResponse = z.infer<typeof readFileResponseSchema>

// writeFile
export const writeFileSuccessResponseSchema = responseMessageSchema
  .extend({
    messageJson: responseMessageSchema.shape.messageJson
      .extend({
        success: z.literal(true),
        created: z.boolean(),
      })
      .strict(),
  })
  .omit({ messageBinary: true })
export type WriteFileSuccessResponse = z.infer<typeof writeFileSuccessResponseSchema>
export const writeFileResponseSchema = z.union([
  writeFileSuccessResponseSchema,
  fileNotFoundResponseSchema,
  fileExistsResponseSchema,
  noPermissionsResponseSchema,
])
export type WriteFileResponse = z.infer<typeof writeFileResponseSchema>

// delete

export const deleteResponseSchema = z.union([voidSuccessResponseSchema, fileNotFoundResponseSchema, noPermissionsResponseSchema])
export type DeleteResponse = z.infer<typeof deleteResponseSchema>

// rename
export const renameResponseSchema = z.union([
  voidSuccessResponseSchema,
  fileNotFoundResponseSchema,
  fileExistsResponseSchema,
  noPermissionsResponseSchema,
])
export type RenameResponse = z.infer<typeof renameResponseSchema>

// copy
export const copyResponseSchema = z.union([
  voidSuccessResponseSchema,
  fileNotFoundResponseSchema,
  fileExistsResponseSchema,
  noPermissionsResponseSchema,
])
export type CopyResponse = z.infer<typeof copyResponseSchema>
