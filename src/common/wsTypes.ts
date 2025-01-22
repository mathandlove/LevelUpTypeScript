import { UIState, ButtonId } from "./types.js";

interface BaseIncomingMessage {
  type: "GIVE_TOKEN" | "BUTTON_CLICKED";
  payload: BasePayload;
}

interface BasePayload {
  clientId: string;
  documentId: string;
}

function isValidBasePayload(payload: any): payload is BasePayload {
  return (
    payload &&
    typeof payload.clientId === "string" &&
    typeof payload.documentId === "string"
  );
}

export interface TokenIncomingMessage extends BaseIncomingMessage {
  type: "GIVE_TOKEN";
  payload: BasePayload & { token: string };
}

export function isValidTokenIncomingMessage(
  message: any
): message is TokenIncomingMessage {
  return (
    message &&
    message.type === "GIVE_TOKEN" &&
    isValidBasePayload(message.payload) &&
    typeof message.payload.token === "string"
  );
}

export interface ButtonClickedIncomingMessage extends BaseIncomingMessage {
  type: "BUTTON_CLICKED";
  payload: BasePayload & { buttonId: string };
}

export function isValidButtonClickedIncomingMessage(
  message: any
): message is ButtonClickedIncomingMessage {
  return (
    message &&
    message.type === "BUTTON_CLICKED" &&
    isValidBasePayload(message.payload) &&
    typeof message.payload.buttonId === "string"
  );
}

// Discriminated union for incoming messages
export type IncomingWebSocketMessage =
  | TokenIncomingMessage
  | ButtonClickedIncomingMessage;

export function isValidIncomingWebSocketMessage(
  message: any
): message is IncomingWebSocketMessage {
  return (
    isValidTokenIncomingMessage(message) ||
    isValidButtonClickedIncomingMessage(message)
  );
}

export interface OutgoingWebSocketMessage {
  type: WebSocketOutputMessageType;
  message?: string;
  payload?: UIState;
}

type WebSocketOutputMessageType =
  | "STATE" // UI state updates
  | "WELCOME" // Server welcome message
  | "UPDATE_SCOPE_REQUEST"; // Scope updates
