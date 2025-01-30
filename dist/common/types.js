import { defaultTopics } from "../resources/defaulttopics.js";
import { validateTasksArray } from "../resources/schemas.js";
import { StarterLevelUpRubricId } from "../resources/keys";
export const defaultReflection = {
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
export const defaultRubric = {
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
};
// Then define any constants
export const defaultUIState = {
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
    currentRubric: defaultRubric,
};
export const defaultDocumentMetaData = {
    level: 1,
    pills: defaultTopics,
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
    rubricInfo: {
        savedRubrics: [],
        currentRubric: null,
        loadRubricId: StarterLevelUpRubricId,
    },
};
export function verifyDocumentMetaDataMap(data) {
    if (typeof data !== "object" || data === null) {
        return false;
    }
    for (const key in data) {
        const metaData = data[key];
        if (typeof metaData !== "object" || metaData === null) {
            console.error(`Invalid metadata at key: ${key}`, metaData);
            return false;
        }
        // Validate level
        if (typeof metaData.level !== "number") {
            console.error(`Invalid 'level' at key: ${key}`, metaData);
            return false;
        }
        // Validate pills
        if (!Array.isArray(metaData.pills) ||
            metaData.pills.some((pill) => typeof pill !== "object" ||
                typeof pill.title !== "string" ||
                typeof pill.outOf !== "number" ||
                typeof pill.current !== "number" ||
                typeof pill.description !== "string")) {
            console.error(`Invalid 'pills' data at key: ${key}`, metaData);
            return false;
        }
        // Validate challengeArray
        const challengeArray = metaData.challengeArray;
        if (!Array.isArray(challengeArray)) {
            console.error(`Invalid 'challengeArray', not an array at key: ${key}`, metaData);
            return false;
        }
        for (const subArray of challengeArray) {
            // Allow null or undefined sub-arrays
            // Sub-array must be an array if not null
            if (!Array.isArray(subArray)) {
                console.error(`Sub-array in 'challengeArray' is not an array at key: ${key}`, subArray);
                return false;
            }
            // Validate each ChallengeInfo object in the sub-array
            for (const challenge of subArray) {
                if (!validateChallengeInfo(challenge)) {
                    console.error(`Invalid ChallengeInfo in 'challengeArray' at key: ${key}`, challenge);
                    return false;
                }
            }
        }
        // Validate optional selectedChallengeNumber
        if (metaData.selectedChallengeNumber !== undefined &&
            typeof metaData.selectedChallengeNumber !== "number") {
            console.error(`Invalid 'selectedChallengeNumber' at key: ${key}`, metaData);
            return false;
        }
        if (typeof metaData.currentText !== "string" ||
            typeof metaData.textBeforeEdits !== "string") {
            console.error(`Invalid 'currentText' or 'textBeforeEdits' at key: ${key}`, metaData);
            return false;
        }
    }
    return true;
}
// Helper function to validate ChallengeInfo TODO - update
export function validateChallengeInfo(challenge) {
    if (typeof challenge !== "object") {
        return false;
    }
    return ((typeof challenge.challengeTitle === "string" ||
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
            validateTasksArray(challenge.taskArray)));
}
//# sourceMappingURL=types.js.map