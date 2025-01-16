import { WebSocket } from "ws";
// First, define the interface

export type WebSocketMessageType =
  | "state" // UI state updates
  | "token" // Token authentication
  | "welcome" // Server welcome message
  | "updateScope" // Scope updates
  | "buttonClicked"; // Button clicked on sidebar

export interface TokenPayload {
  clientId: string;
  documentId: string;
  token: string;
}

export type ButtonClickedPayload = {
  buttonId: ButtonId;
  buttonTitle?: string;
};

export interface WebSocketMessage {
  type: WebSocketMessageType;
  payload?: UIState | ButtonClickedPayload | TokenPayload;
  message?: string; // Optional message field
}

export interface StateMessage {
  type: "state";
  state: UIState;
}

export interface WelcomeMessage {
  type: "welcome";
  message: string;
}

export interface TokenMessage {
  type: "token";
  payload: TokenPayload;
}

export interface ButtonClickedMessage {
  type: "buttonClicked";
  payload: ButtonClickedPayload;
}

// Then define the interface that uses it
export type ButtonId =
  | "next-button"
  | "back-button"
  | "check-work-button"
  | "home-button"
  | "skip-button";

export interface UIState {
  currentPage:
    | "home-page"
    | "AI-Feeling"
    | "server-error"
    | "challenge-card"
    | "feel-response-card"
    | "focus-sentence"
    | "reflection-card"
    | "example-card"
    | "challenge-feedback-card"
    | "customize-card";
  waitingAnimationOn: boolean;
  visibleButtons: ButtonId[]; // Now enforces specific button IDs
  buttonsDisabled: ButtonId[];
  level: number;
  pills: Array<{
    title: string;
    outOf: number;
    current: number;
  }>;
  copypasted: number;
  timeSpentHours: number;
  timeSpentMinutes: number;

  cardMainText?: string;
  cardSubtitle?: string;
  // Reflection card content
  reflection?: {
    question?: string;
    placeholder?: string;
  };
  taskFeedback?: "no-changes" | "wrong-location" | "invalid-edit";
  taskFeedbackMessage?: string;

  // Challenge card content
  tasks?: Array<{
    text: string;
  }>;

  // Customize card content
  rubric?: {
    title: string;
  };
}
// Then define any constants
export const defaultUIState: UIState = {
  currentPage: "home-page",
  waitingAnimationOn: false,
  visibleButtons: [],
  buttonsDisabled: [],
  level: 0,
  pills: [
    { title: "Pirate Slang", outOf: 2, current: 5 },
    { title: "Robot Slang", outOf: 5, current: 5 },
  ],
  copypasted: 0,
  timeSpentHours: 0,
  timeSpentMinutes: 0,
};

// Finally, define any functions that use the types
export function isTokenData(message: any): message is TokenPayload {
  return (
    message &&
    typeof message.clientId === "string" &&
    typeof message.documentId === "string" &&
    typeof message.token === "string"
  );
}

export interface LevelUpWebSocket extends WebSocket {
  clientId: string;
  documentId: string;
}
