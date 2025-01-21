import { WebSocket } from "ws";
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
