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
  | "share-rubric-button"
  | "save-rubric-button"
  | "start-edits-button"
  | "new-rubric-button"
  | "save";

export interface Topic {
  title: string;
  outOf: number;
  current: number;
  description: string;
  studentGoalArray: Array<string>;
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
      title: "Thesis",
      description:
        "Have a clear and specific thesis. All ideas in the essay should work together to support this central argument. The thesis is concise, debatable, and guides the reader through the rest of the paper.",
      outOf: 3,
      current: 0,
      studentGoalArray: [
        "Grab the reader's attention and curiosity.",
        "Make my argument feel focused and impactful.",
        "Make it sound like I know what I am talking about.",
      ],
    },
    {
      title: "Organization",
      description:
        " The essay is logically organized, with a clear introduction, body paragraphs, and conclusion. Each body paragraph should begin with a clear topic sentence and transition smoothly to the next paragraph. The structure should help readers follow the argument and maintain overall clarity.",
      outOf: 3,
      current: 0,
      studentGoalArray: [
        "Make my paper easy to understand.",
        "Make me sound smarter.",
        "Make it so my ideas pop out.",
      ],
    },

    {
      title: "Evidence",
      description:
        "The essay provides sufficient and relevant evidence to support the thesis. Each piece of evidence should be explained or analyzed to show how it reinforces the argument. Clear connections between evidence and the writer's main points are essential.",
      outOf: 3,
      current: 0,
      studentGoalArray: [
        "Make it look like I read the book/did my research.",
        "Make my paper really convincing",
        "Help the reader understand what I am trying to say.",
      ],
    },
    {
      title: "Grammar",
      description:
        "The essay is written in a coherent and fluent style, with appropriate word choice and sentence variety. Grammar, punctuation, and spelling are generally correct.",
      outOf: 3,
      current: 0,
      studentGoalArray: [
        "Make me sound proffesional and educated.",
        "Get rid of the errors in my paper.",
        "Make my paper easy to read.",
      ],
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
  gradeLevel: 9,
  databaseID: "starterRubric",
  googleSheetID: "",
  lastUpdated: new Date().toISOString(),
};

export interface SavedActivity {
  savedReflections: Array<Reflection>;
  savedChallenges: Array<ChallengeInfo>;
}

export type ChallengeInfo = {
  studentGoal?: string;
  currentSentenceCoordinates?: {
    startIndex: number;
    endIndex: number;
  };
  aiRawFeedback?: string;
  modifiedSentences: string[]; //Selected Sentence goes in here
  formattedFeedback?: string;
  aiFeeling?: string;
  aiDirections?: string;
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
  selectedRubric: number;
  listOfAvailableRubrics: Array<String>;
  motivationSelection: Array<string>;
  // Challenge card content

  importError?: string;
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
  selectedRubric: 0,
  listOfAvailableRubrics: [],
  motivationSelection: [],
};

//----------------------------------------------------------
//Todo confirm validation functionof this as it keeps changing.
export interface DocumentMetaData {
  level: number;
  pills: Array<Topic>;
  paperScores: Array<Topic>;
  selectedChallengeNumber?: number;
  currentChallenge?: ChallengeInfo;
  currentText: string;
  textBeforeEdits: string;
  savedActivity: SavedActivity;
  reflectionTemplate: Reflection;
  savedRubrics: Array<Rubric>;
  currentRubricID: string;
  defaultRubric?: Rubric;
  rubricLastUpdated: string;
  tempNewRubric?: Rubric;
  tempImportRubricId?: string;
  flags?: {};
}

export const defaultDocumentMetaData: DocumentMetaData = {
  level: 1,
  pills: defaultTopics,
  paperScores: [],
  currentText: "",

  textBeforeEdits: "",
  savedActivity: {
    savedReflections: [],
    savedChallenges: [],
  },
  reflectionTemplate: defaultReflection,
  savedRubrics: [],
  currentRubricID: "starterRubric",
  rubricLastUpdated: new Date().toISOString(),
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
