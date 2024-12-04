import { Data, WebSocket } from "ws"
import { arrayBufferFromMessage, messageFromBytes, Message } from "./wireProtocol"
import { isArrayBuffer } from "util/types"

export const sendMessage = (ws: WebSocket, message: Message): void => {
  if (ws.readyState !== WebSocket.OPEN) {
    throw new Error(`WebSocket not open: ${ws.readyState}`)
  }
  ws.send(arrayBufferFromMessage(message))
}

export const messageFromWebSocketMessage = (data: Data): { success: true; message: Message } | { success: false; error: unknown } =>
  messageFromBytes(uint8ArrayFromRawData(data))

const uint8ArrayFromRawData = (data: Data): Uint8Array => {
  if (data instanceof Uint8Array) {
    return data
  }
  if (isArrayBuffer(data)) {
    return new Uint8Array(data)
  }
  if (typeof data === "string") {
    throw new Error(`'string' websocket messages are unsupported: ${data}`)
  }
  throw new Error(`'Buffer[]' websocket message support is NYI: ${data}`)
}
