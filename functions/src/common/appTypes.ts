import { ActorRef } from "xstate";
import { LevelUpWebSocket } from "../websocket";
import {
  ChallengeInfo,
  defaultUIState,
  DocumentMetaData,
  Rubric,
  UIState,
} from "./types";
import { IncomingWebSocketMessage } from "./wsTypes";
import { OAuth2Client } from "google-auth-library";

type InternalMessages = { type: "NEW_RUBRIC_READY" };
export type AppEvent =
  | InternalMessages
  | IncomingWebSocketMessage
  | ErrorMessageEvent;

interface AppState {
  token: string;
  documentId: string;
  ws: LevelUpWebSocket;
  persistentDataFileId: string;
  levelUpFolderId: string;
  GoogleServices: {
    oauth2Client: OAuth2Client; // Authenticated OAuth2 client
    drive: any; // Google Drive API client
    docs: any; // Google Docs API client
    sheets: any; // Google Sheets API client
  };
  challengeRetryCount: number;
  flags: {
    nextPushed: boolean;
    studentGoal: string;
  };
}

export const defaultAppState: AppState = {
  token: "Waiting for token...",
  documentId: "waiting for documentID",
  ws: null,
  persistentDataFileId: null,
  GoogleServices: null,
  levelUpFolderId: "",
  challengeRetryCount: 0,
  flags: {
    nextPushed: false,
    studentGoal: "",
  },
};

export interface AppContext {
  appState: AppState;
  uiState: UIState;
  documentMetaData: DocumentMetaData;
  self: ActorRef<any>;
}

export const defaultAppContext: AppContext = {
  appState: defaultAppState,
  uiState: defaultUIState,
  documentMetaData: undefined,
  self: undefined,
};

export type ErrorMessageEvent = {
  type: "error";
  data: {
    name: string;
    message: string;
  };
};
