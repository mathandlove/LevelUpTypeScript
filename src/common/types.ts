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
}

export const defaultDocumentMetaData: DocumentMetaData = {
  level: 1,
  pills: defaultTopics,
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

      if (
        typeof metaData.level !== "number" ||
        !Array.isArray(metaData.pills) ||
        metaData.pills.some(
          (pill) =>
            typeof pill !== "object" ||
            typeof pill.title !== "string" ||
            typeof pill.outOf !== "number" ||
            typeof pill.current !== "number" ||
            typeof pill.isReflection !== "boolean" ||
            (pill.description !== undefined &&
              typeof pill.description !== "string")
        )
      ) {
        console.error(`Invalid metadata at key: ${key}`, metaData);
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error("Error verifying persistent data:", error);
    return false;
  }
}
