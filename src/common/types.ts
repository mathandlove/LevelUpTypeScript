import { WebSocket } from "ws";
import { defaultTopics } from "../resources/defaulttopics.js";
import { TasksArray, validateTasksArray } from "../resources/schemas.js";
// First, define the interface

//websocket Types

export type ButtonId =
  | "next-button"
  | "back-button"
  | "check-work-button"
  | "home-button"
  | "skip-button"
  | "pill-button";

export interface Topic {
  title: string;
  outOf: number;
  current: number;
  description: string;
}

export interface UIState {
  currentPage:
    | "home-page"
    | "AI-Feeling"
    | "celebrateScreen"
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
  formerLevel: number;
  animateLevelUp: boolean;
  pills: Array<Topic>;
  copypasted: number;
  timeSpentHours: number;
  timeSpentMinutes: number;
  cardSubtitle?: string;
  cardMainText?: string;
  errorMessage?: string;
  // Reflection card content
  reflection?: {
    question?: string;
    placeholder?: string;
  };
  taskFeedback?: "no-changes" | "wrong-location" | "incorrect" | undefined;
  taskFeedbackMessage?: string;

  // Challenge card content
  tasks?: TasksArray;

  // Customize card content
  rubric?: {
    title: string;
  };
}
// Then define any constants
export const defaultUIState: UIState = {
  currentPage: "home-page",
  waitingAnimationOn: false,
  visibleButtons: ["next-button"],
  buttonsDisabled: [],
  level: 1,
  formerLevel: 1,
  animateLevelUp: false,
  pills: [],
  copypasted: 0,
  timeSpentHours: 0,
  timeSpentMinutes: 0,
};

//----------------------------------------------------------
//Todo confirm validation functionof this as it keeps changing.
export interface DocumentMetaData {
  level: number;
  pills: Array<Topic>;
  reflection?: {
    question?: string;
    placeholder?: string;
  };
  rubric?: {
    title: string;
  };
  challengeArray: ChallengeInfo[][];
  newChallengesArray: ChallengeInfo[][];
  newChallengesReady: boolean;
  selectedChallengeNumber?: number;
  currentText: string;
  textBeforeEdits: string;
}

export const defaultDocumentMetaData: DocumentMetaData = {
  level: 1,
  pills: defaultTopics,
  challengeArray: [],
  newChallengesArray: [],
  newChallengesReady: false,
  currentText: "",
  textBeforeEdits: "",
};

export interface DocumentMetaDataMap {
  [key: string]: DocumentMetaData;
}

export function verifyDocumentMetaDataMap(
  data: unknown
): data is DocumentMetaDataMap {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  for (const key in data) {
    const metaData = (data as Record<string, unknown>)[key];

    if (typeof metaData !== "object" || metaData === null) {
      console.error(`Invalid metadata at key: ${key}`, metaData);
      return false;
    }

    // Validate level
    if (typeof (metaData as DocumentMetaData).level !== "number") {
      console.error(`Invalid 'level' at key: ${key}`, metaData);
      return false;
    }

    // Validate pills
    if (
      !Array.isArray((metaData as DocumentMetaData).pills) ||
      (metaData as DocumentMetaData).pills.some(
        (pill) =>
          typeof pill !== "object" ||
          typeof pill.title !== "string" ||
          typeof pill.outOf !== "number" ||
          typeof pill.current !== "number" ||
          typeof pill.description !== "string"
      )
    ) {
      console.error(`Invalid 'pills' data at key: ${key}`, metaData);
      return false;
    }

    // Validate optional reflection field
    if ((metaData as DocumentMetaData).reflection !== undefined) {
      const reflection = (metaData as DocumentMetaData).reflection;
      if (
        typeof reflection !== "object" ||
        (reflection.question !== undefined &&
          typeof reflection.question !== "string") ||
        (reflection.placeholder !== undefined &&
          typeof reflection.placeholder !== "string")
      ) {
        console.error(`Invalid 'reflection' data at key: ${key}`, metaData);
        return false;
      }
    }

    // Validate optional rubric field
    if ((metaData as DocumentMetaData).rubric !== undefined) {
      const rubric = (metaData as DocumentMetaData).rubric;
      if (typeof rubric !== "object" || typeof rubric.title !== "string") {
        console.error(`Invalid 'rubric' data at key: ${key}`, metaData);
        return false;
      }
    }

    // Validate challengeArray
    const challengeArray = (metaData as DocumentMetaData).challengeArray;
    if (!Array.isArray(challengeArray)) {
      console.error(
        `Invalid 'challengeArray', not an array at key: ${key}`,
        metaData
      );
      return false;
    }

    for (const subArray of challengeArray) {
      // Allow null or undefined sub-arrays

      // Sub-array must be an array if not null
      if (!Array.isArray(subArray)) {
        console.error(
          `Sub-array in 'challengeArray' is not an array at key: ${key}`,
          subArray
        );
        return false;
      }

      // Validate each ChallengeInfo object in the sub-array
      for (const challenge of subArray) {
        if (!validateChallengeInfo(challenge)) {
          console.error(
            `Invalid ChallengeInfo in 'challengeArray' at key: ${key}`,
            challenge
          );
          return false;
        }
      }
    }

    // Validate optional selectedChallengeNumber
    if (
      (metaData as DocumentMetaData).selectedChallengeNumber !== undefined &&
      typeof (metaData as DocumentMetaData).selectedChallengeNumber !== "number"
    ) {
      console.error(
        `Invalid 'selectedChallengeNumber' at key: ${key}`,
        metaData
      );
      return false;
    }

    if (
      typeof (metaData as DocumentMetaData).currentText !== "string" ||
      typeof (metaData as DocumentMetaData).textBeforeEdits !== "string"
    ) {
      console.error(
        `Invalid 'currentText' or 'textBeforeEdits' at key: ${key}`,
        metaData
      );
      return false;
    }
  }
  return true;
}

// Helper function to validate ChallengeInfo TODO - update
export function validateChallengeInfo(challenge: any): boolean {
  if (typeof challenge !== "object") {
    return false;
  }

  return (
    (typeof challenge.challengeTitle === "string" ||
      challenge.challengeTitle === undefined) &&
    typeof challenge.aiSuggestion === "object" &&
    challenge.aiSuggestion !== null &&
    typeof challenge.aiSuggestion.originalSentence === "string" &&
    typeof challenge.aiSuggestion.aiImprovedSentence === "string" &&
    typeof challenge.aiSuggestion.aiReasoning === "string" &&
    (challenge.aiDirections === undefined ||
      typeof challenge.aiDirections === "string") &&
    (challenge.aiFeeling === undefined ||
      typeof challenge.aiFeeling === "string") &&
    (challenge.sentenceStartIndex === undefined ||
      typeof challenge.sentenceStartIndex === "number") &&
    (challenge.sentenceEndIndex === undefined ||
      typeof challenge.sentenceEndIndex === "number") &&
    (challenge.taskArray === undefined ||
      validateTasksArray(challenge.taskArray))
  );
}

export type ChallengeInfo = {
  challengeTitle?: string;
  aiSuggestion: {
    originalSentence: string;
    aiImprovedSentence: string;
    aiReasoning: string;
  };
  modifiedSentences: string[];
  aiDirections?: string;
  aiFeeling?: string;
  sentenceStartIndex?: number;
  sentenceEndIndex?: number;
  taskArray?: TasksArray;
  challengeResponse?:
    | "valid"
    | "tooFar"
    | "noChanges"
    | "correct"
    | "incorrect";
};
