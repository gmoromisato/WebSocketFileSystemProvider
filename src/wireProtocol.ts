import { z } from "zod"
import { jsonValueSchema, stringToJSONSchema } from "./util/jsonSchema"

// WebSocket messages have the following layout
// [0]                32-bit totalPayloadLength
// [4]                32-bit jsonLength
// [8]                message type 0=Command, 1=Response, 2=Event
// [9]                start of json
//      ...json...
// [9 + jsonLength]   start of binary
//      ...binary...

const PAYLOAD_LENGTH_OFFSET = 0
const JSON_LENGTH_OFFSET = 4
const MESSAGE_TYPE_OFFSET = 8
const HEADER_LENGTH = 9

type Values<T> = T[keyof T]

export const MessageType = {
  Command: 0,
  Response: 1,
  Event: 2,
} as const
export type MessageType = Values<typeof MessageType>

// Command messages

export const commandMessageSchema = z.object({
  messageType: z.literal(MessageType.Command),
  messageJson: z
    .object({
      command: z.string(),
      commandId: z.string().uuid(),
    })
    .passthrough(),
  messageBinary: z.instanceof(Uint8Array).optional(),
})
export type CommandMessage = z.infer<typeof commandMessageSchema>

// Response messages

export const responseMessageSchema = z.object({
  messageType: z.literal(MessageType.Response),
  messageJson: z
    .object({
      commandId: z.string().uuid(),
      success: z.boolean(),
    })
    .passthrough(),
  messageBinary: z.instanceof(Uint8Array).optional(),
})
export type ResponseMessage = z.infer<typeof responseMessageSchema>

// Event messages

export const eventMessageSchema = z.object({
  messageType: z.literal(MessageType.Event),
  messageJson: jsonValueSchema,
  messageBinary: z.instanceof(Uint8Array).optional(),
})
export type EventMessage = z.infer<typeof eventMessageSchema>

export const messageSchema = z.discriminatedUnion("messageType", [commandMessageSchema, responseMessageSchema, eventMessageSchema])

export type Message = z.infer<typeof messageSchema>

// Helper functions

export function messageFromBytes(bytes: Uint8Array): { success: true; message: Message } | { success: false; error: unknown } {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    // Extract the header
    const totalLength = view.getUint32(PAYLOAD_LENGTH_OFFSET)
    const jsonLength = view.getUint32(JSON_LENGTH_OFFSET)
    const binaryLength = totalLength - jsonLength
    const messageType = view.getUint8(MESSAGE_TYPE_OFFSET)

    // Extract the JSON string
    const messageJson = stringToJSONSchema.parse(new TextDecoder().decode(bytes.slice(HEADER_LENGTH, HEADER_LENGTH + jsonLength)))

    // Extract the binary data
    const messageBinary = binaryLength ? bytes.slice(HEADER_LENGTH + jsonLength, HEADER_LENGTH + jsonLength + binaryLength) : undefined

    const provisionalMessage = {
      messageType,
      messageJson,
      ...(messageBinary ? { messageBinary } : undefined),
    }
    return { success: true, message: messageSchema.parse(provisionalMessage) }
  } catch (error: unknown) {
    return {
      success: false,
      error: new Error(`Error reading message from Uint8Array: ${error}`),
    }
  }
}

export function arrayBufferFromMessage({ messageType, messageJson, messageBinary: binary }: Message): ArrayBuffer {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(messageJson))
  const jsonLength = jsonBytes.length
  const binaryLength = binary?.length ?? 0

  // Create a buffer big enough for an 8 byte header, the JSON string, and the binary data
  const buffer = new ArrayBuffer(HEADER_LENGTH + jsonLength + binaryLength)
  const view = new DataView(buffer)
  const uint8View = new Uint8Array(buffer)

  // Write the total length into the buffer
  view.setUint32(PAYLOAD_LENGTH_OFFSET, jsonLength + binaryLength)

  // Write the JSON length into the buffer
  view.setUint32(JSON_LENGTH_OFFSET, jsonLength)

  // Write the message type into the buffer
  view.setUint8(MESSAGE_TYPE_OFFSET, messageType)

  // Write the JSON into the buffer
  uint8View.set(jsonBytes, HEADER_LENGTH)

  // Write the binary data into the buffer
  if (binary) {
    uint8View.set(binary, HEADER_LENGTH + jsonLength)
  }

  return buffer
}
