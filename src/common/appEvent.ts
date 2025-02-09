import { IncomingWebSocketMessage } from "./wsTypes";

type InternalEvent =
  | { type: "TOPICS_UPDATED" }
  | { type: "INITIAL_ARRAY_CHECK" }
  | { type: "CHALLENGE_SELECTED"; payload: { topicNumber: number } } // Add payload here
  | { type: "CREATE_CHALLENGES" }
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
// Add button click to AppEvent type
export type AppEvent =
  | IncomingWebSocketMessage
  | ErrorMessageEvent
  | InternalEvent;

type ErrorMessageEvent = {
  type: "error";
  data: {
    name: string;
    message: string;
  };
};
