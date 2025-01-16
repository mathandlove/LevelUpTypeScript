import { WebSocket } from "ws";
// First, define the interface
export interface TokenData {
  clientId: string;
  documentId: string;
  token: string;
}

// Then define the interface that uses it
export interface UIState {
  currentPage: "home" | "loading" | "error";
  waitingAnimationOn: boolean;
}

// Then define any constants
export const defaultUIState: UIState = {
  currentPage: "home",
  waitingAnimationOn: true,
};

// Finally, define any functions that use the types
export function isTokenData(message: any): message is TokenData {
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
