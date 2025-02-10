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
import { StateMachine } from "xstate";

type EventsFromChildren =
  //From CreateChallenge
  | { type: "CHALLENGE_CREATED"; payload: { challenge: ChallengeInfo } }
  | { type: "RUBRIC_CREATED"; payload: { rubric: Rubric } };

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
export type AppEvent =
  | IncomingWebSocketMessage
  | ErrorMessageEvent
  | EventsFromChildren;

type ErrorMessageEvent = {
  type: "error";
  data: {
    name: string;
    message: string;
  };
};

interface AppState {
  token: string;
  clientId: string;
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
}

const defaultAppState: AppState = {
  token: "Waiting for token...",
  clientId: "Waiting for clientID",
  documentId: "waiting for documentID",
  ws: null,
  persistentDataFileId: null,
  GoogleServices: null,
  levelUpFolderId: "",
};

interface ChallengeContext {
  challenge: ChallengeInfo;
  selectedTopicDescription: string;
  pendingGoal?: string;
}

type ChallengeEvent =
  | { type: "CREATE_CHALLENGE" }
  | { type: "GOAL_SELECTED"; payload: { goal: string } };

interface RubricContext {
  rubric: Rubric;
}

type RubricEvent = { type: "CREATE_RUBRIC" };

export interface AppContext {
  appState: AppState;
  uiState: UIState;
  documentMetaData: DocumentMetaData;
  challengeActor?: StateMachine<ChallengeContext, any, ChallengeEvent>;
  rubricActor?: StateMachine<RubricContext, any, RubricEvent>;
}

export const defaultAppContext: AppContext = {
  appState: defaultAppState,
  uiState: defaultUIState,
  documentMetaData: undefined,
};
