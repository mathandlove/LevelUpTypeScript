import { UIState } from "./types";

interface BaseIncomingMessage {
  type: "GIVE_TOKEN" | "BUTTON_CLICKED";
  payload: BasePayload;
}

interface BasePayload {}

function isValidBasePayload(payload: any): payload is BasePayload {
  return payload;
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
  | {
      type: "GIVE_TOKEN";
      payload: { token: string; documentId: string };
    }
  | {
      type: "BUTTON_CLICKED";
      payload: {
        buttonId: string;
        buttonTitle?: number;
        textResponse?: string;
        selectedIndex?: number;
        importDocumentId?: string;
      };
    }
  | {
      type: "CUSTOMIZE_CLICKED";
      payload: {};
    }
  | {
      type: "USER_BACK_ON_TAB";
      payload: {};
    }
  | {
      type: "SELECT_GOAL";
      payload: {
        buttonTitle: string;
      };
    };

export function isValidIncomingWebSocketMessage(
  message: any
): message is IncomingWebSocketMessage {
  if (!message || typeof message !== "object") return false;

  switch (message.type) {
    case "GIVE_TOKEN":
      return (
        message.payload &&
        typeof message.payload.token === "string" &&
        typeof message.payload.documentId === "string"
      );

    case "BUTTON_CLICKED":
      return (
        message.payload &&
        typeof message.payload.buttonId === "string" &&
        (message.payload.buttonTitle === undefined ||
          typeof message.payload.buttonTitle === "number") &&
        (message.payload.textResponse === undefined ||
          typeof message.payload.textResponse === "string")
      );

    case "CUSTOMIZE_CLICKED":
      return message.payload;

    case "USER_BACK_ON_TAB":
      return message.payload;

    case "SELECT_GOAL":
      return message.payload && typeof message.payload.buttonTitle === "string";

    default:
      return false;
  }
}

export interface OutgoingWebSocketMessage {
  type: WebSocketOutputMessageType;
  message?: string;
  payload?:
    | UIState
    | { url: string }
    | { rubricID: string; rubricName: string; rubricLink: string };
}

type WebSocketOutputMessageType =
  | "STATE" // UI state updates
  | "WELCOME" // Server welcome message
  | "UPDATE_SCOPE_REQUEST" // Scope updates
  | "EXTERNAL_PAGE_TO_OPEN" // External page to open
  | "SHARE_RUBRIC_POPUP";
