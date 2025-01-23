import { WebSocket } from "ws";
import { defaultTopics } from "../resources/defaulttopics.js";
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
  description?: string;
  isReflection: boolean;
}

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
  visibleButtons: ["next-button"],
  buttonsDisabled: [],
  level: 0,
  pills: [],
  copypasted: 0,
  timeSpentHours: 0,
  timeSpentMinutes: 0,
};

//----------------------------------------------------------

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
  selectedChallengeNumber?: number;
  selectedChallenge?: ChallengeInfo;
}

export const defaultDocumentMetaData: DocumentMetaData = {
  level: 1,
  pills: defaultTopics,
  challengeArray: [],
};

export interface DocumentMetaDataMap {
  [key: string]: DocumentMetaData;
}

export function verifyDocumentMetaDataMap(
  data: unknown
): data is DocumentMetaDataMap {
  try {
    if (typeof data !== "object" || data === null) {
      return false;
    }
    for (const key in data) {
      const metaData = data[key];

      // Check required fields
      if (
        typeof metaData.level !== "number" ||
        !Array.isArray(metaData.pills) ||
        !Array.isArray(metaData.challengeArray)
      ) {
        console.error(`Invalid metadata at key: ${key}`, metaData);
        return false;
      }

      // Check pills array
      if (
        metaData.pills.some(
          (pill) =>
            typeof pill !== "object" ||
            typeof pill.title !== "string" ||
            typeof pill.outOf !== "number" ||
            typeof pill.current !== "number" ||
            typeof pill.isReflection !== "boolean" ||
            (pill.selectedPill !== undefined &&
              typeof pill.selectedPill !== "number") ||
            (pill.description !== undefined &&
              typeof pill.description !== "string")
        )
      ) {
        console.error(`Invalid pills data at key: ${key}`, metaData);
        return false;
      }

      // Check optional reflection field
      if (metaData.reflection !== undefined) {
        if (
          typeof metaData.reflection !== "object" ||
          (metaData.reflection.question !== undefined &&
            typeof metaData.reflection.question !== "string") ||
          (metaData.reflection.placeholder !== undefined &&
            typeof metaData.reflection.placeholder !== "string")
        ) {
          console.error(`Invalid reflection data at key: ${key}`, metaData);
          return false;
        }
      }

      // Check optional rubric field
      if (metaData.rubric !== undefined) {
        if (
          typeof metaData.rubric !== "object" ||
          typeof metaData.rubric.title !== "string"
        ) {
          console.error(`Invalid rubric data at key: ${key}`, metaData);
          return false;
        }
      }

      // Check multidimensional challengeArray
      if (!Array.isArray(metaData.challengeArray)) {
        console.error(
          `ChallengeArray is not an array at key: ${key}`,
          metaData
        );
        return false;
      }

      // Check each sub-array in challengeArray
      if (
        metaData.challengeArray.some((subArray) => {
          if (!Array.isArray(subArray)) {
            console.error(
              `Sub-array is not an array in challengeArray at key: ${key}`,
              subArray
            );
            return true; // Return true to indicate invalid item found
          }
          // Check each challenge in the sub-array
          return subArray.some((challenge) => !verifyChallenge(challenge));
        })
      ) {
        return false;
      }

      // Check optional selectedChallenge and selectedChallengeNumber
      if (
        (metaData.selectedChallengeNumber !== undefined &&
          typeof metaData.selectedChallengeNumber !== "number") ||
        (metaData.selectedChallenge !== undefined &&
          !verifyChallenge(metaData.selectedChallenge))
      ) {
        console.error(
          `Invalid challenge selection data at key: ${key}`,
          metaData
        );
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error("Error verifying persistent data:", error);
    return false;
  }
}

// Helper function to verify ChallengeInfo
function verifyChallenge(challenge: any): boolean {
  return (
    typeof challenge === "object" &&
    challenge !== null &&
    typeof challenge.sentenceStartsWith === "string" &&
    typeof challenge.aiDirections === "string" &&
    typeof challenge.aiFeeling === "string" &&
    (challenge.sentenceLocation === undefined ||
      typeof challenge.sentenceLocation === "number")
  );
}

export interface ChallengeInfo {
  sentenceStartsWith: string;
  aiDirections: string;
  aiFeeling: string;
  sentenceLocation?: number;
  ready: boolean;
}
