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

/*
  | { type: "TOPICS_UPDATED" }
  | { type: "INITIAL_ARRAY_CHECK" }

  | { type: "CHALLENGE_SELECTED"; payload: { topicNumber: number } } // Add payload here
  | 
  | {
      type: "REVIEWED";
      payload: {
        challengeResponse: "noChanges" | "tooFar" | "incorrect" | "correct";
      };
    }
  | { type: "REFLECTION_SELECTED" }
  | { type: "REFLECTION_SUBMITTED" }
  | { type: "BACK_TO_HOME" }
  | { type: "RUBRIC_SHEET_CREATED" }
  | { type: "CREATE_NEW_RUBRIC" }
  | { type: "SAVE_RUBRIC" }
  | { type: "CREATE_TEMP_GOOGLE_SHEET" }
  //RubricEvents
  | { type: "LOAD_RUBRIC_ARRAY_FROM_PERSISTENT_DATA" }
  | { type: "RUBRIC_ARRAY_LOADED" }
  | { type: "NEW_RUBRIC_AND_SHEET_CREATED" }
  | { type: "UPDATE_RUBRIC" }
  | { type: "NEW_RUBRIC_UPDATED_FROM_GOOGLE_SHEET" }
  | { type: "NEW_RUBRIC_UNPACKED" }
  | { type: "NEW_RUBRIC_SAVED" }
  | { type: "CREATE_RUBRIC_COPY"; payload: { importDocumentId: string } }
  | { type: "GOAL_FLAGGED"; payload: { goal: string } }
  | { type: "AI_FEELING_READY" }
  | { type: "CHALLENGE_READY" };
  */
// Add button click to AppEvent type

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
