import { WebSocket } from "ws";
import { defaultTopics } from "../resources/defaulttopics.js";
import { TasksArray, validateTasksArray } from "../resources/schemas.js";
import { StarterLevelUpRubricId } from "../resources/keys.js";
// First, define the interface

//websocket Types

export type ButtonId =
  | "next-button"
  | "back-button"
  | "check-work-button"
  | "home-button"
  | "skip-button"
  | "pill-button"
  | "submit-button"
  | "edit-rubric-button"
  | "save-rubric-button"
  | "start-edits-button"
  | "new-rubric-button"
  | "save";

export interface Topic {
  title: string;
  outOf: number;
  current: number;
  description: string;
}

export interface Reflection {
  enabled: boolean;
  copyPercentIncluded: boolean;
  question: Array<string>;
  submittedAnswers: Array<string>;
  placeholder: string;
  outOf: number;
  currentScore: number;
  selectedQuestion: number;
  noInputOnSubmit: boolean;
}

export const defaultReflection: Reflection = {
  enabled: true,
  copyPercentIncluded: false,
  noInputOnSubmit: false,
  question: [
    "What went well?",
    "What was hard?",
    "How can the teacher help you?",
  ],
  submittedAnswers: [],
  selectedQuestion: 0,
  placeholder: "Enter your reflection here...",
  outOf: 1,
  currentScore: 0,
};

export interface Rubric {
  title: string;
  topics: Topic[];
  reflection: Reflection;
  gradeLevel: number;
  databaseID: string;
  googleSheetID: string;
  isDefault: boolean;
  lastUpdated: string;
}

//My rubric validation is much more complicated.
export function verifyRubric(rubric: unknown): rubric is Rubric {
  return typeof rubric === "object" && rubric !== null && "title" in rubric;
}

export const defaultRubric: Rubric = {
  title: "Starter Level Up Rubric",
  topics: [
    {
      title: "Thesis Statement",
      description: "Has Clear, specific, and well-developed thesis.",
      outOf: 5,
      current: 0,
    },
    {
      title: "Organization",
      description: "Has Logical flow with effective transitions.",
      outOf: 5,
      current: 0,
    },
    {
      title: "Word Choice",
      description: "Uses precise, varied, and appropriate vocabulary.",
      outOf: 5,
      current: 0,
    },
    {
      title: "Grammar",
      description: "Is Free of major grammatical errors .",
      outOf: 5,
      current: 0,
    },
  ],
  reflection: {
    enabled: true,
    copyPercentIncluded: false,
    noInputOnSubmit: false,
    question: [
      "What went well?",
      "What was hard?",
      "How can the teacher help you?",
    ],
    submittedAnswers: [],
    selectedQuestion: 0,
    placeholder: "Enter your reflection here...",
    outOf: 1,
    currentScore: 0,
  },
  gradeLevel: 1,
  databaseID: "starterRubric",
  googleSheetID: "",
  isDefault: true,
  lastUpdated: new Date().toISOString(),
};

export interface SavedActivity {
  savedReflections: Array<Reflection>;
  savedChallenges: Array<ChallengeInfo>;
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
    | "customize-card"
    | "customize-card-edit-newWindow";
  waitingAnimationOn: boolean;
  visibleButtons: ButtonId[]; // Now enforces specific button IDs
  buttonsDisabled: ButtonId[];
  level: number;
  formerLevel: number;
  animateLevelUp: boolean;

  pills: Array<Topic>;
  reflection: Reflection;
  copypasted: number;
  timeSpentHours: number;
  timeSpentMinutes: number;
  cardSubtitle?: string;
  cardMainText?: string;
  errorMessage?: string;
  taskFeedback?: "no-changes" | "wrong-location" | "incorrect" | undefined;
  taskFeedbackMessage?: string;
  rubricName: string;

  // Challenge card content
  tasks?: TasksArray;
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
  reflection: defaultReflection,
  timeSpentHours: 0,
  timeSpentMinutes: 0,
  copypasted: 0,
  rubricName: "",
};

//----------------------------------------------------------
//Todo confirm validation functionof this as it keeps changing.
export interface DocumentMetaData {
  level: number;
  pills: Array<Topic>;
  paperScores: Array<Topic>;
  challengeArray: ChallengeInfo[][];
  newChallengesArray: ChallengeInfo[][];
  newChallengesReady: boolean;
  selectedChallengeNumber?: number;
  currentText: string;
  textBeforeEdits: string;
  savedActivity: SavedActivity;
  reflectionTemplate: Reflection;
  savedRubrics: Array<Rubric>;
  currentRubricID: string;
  defaultRubric?: Rubric;
}

export const defaultDocumentMetaData: DocumentMetaData = {
  level: 1,
  pills: defaultTopics,
  paperScores: [],
  challengeArray: [],
  newChallengesArray: [],
  newChallengesReady: false,
  currentText: "",

  textBeforeEdits: "",
  savedActivity: {
    savedReflections: [],
    savedChallenges: [],
  },
  reflectionTemplate: defaultReflection,
  savedRubrics: [],
  currentRubricID: "starterRubric",
};

export interface DocumentMetaDataMap {
  rubricArray: Array<Rubric>;
  defaultRubric: Rubric;
  [key: string]: DocumentMetaData | Array<Rubric> | Rubric;
}

export function verifyDocumentMetaDataMap(
  data: unknown
): data is DocumentMetaDataMap {
  if (typeof data !== "object" || data === null) {
    return false;
  } else {
    return true;
  }

  //TODO: Create validation for rubricArray and documentMetaData.
  /*
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

*/
}
