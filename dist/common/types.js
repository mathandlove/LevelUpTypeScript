import { defaultTopics } from "../resources/defaulttopics.js";
// Then define any constants
export const defaultUIState = {
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
export const defaultDocumentMetaData = {
    level: 1,
    pills: defaultTopics,
    challengeArray: [],
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
        // Validate optional reflection field
        if (metaData.reflection !== undefined) {
            const reflection = metaData.reflection;
            if (typeof reflection !== "object" ||
                (reflection.question !== undefined &&
                    typeof reflection.question !== "string") ||
                (reflection.placeholder !== undefined &&
                    typeof reflection.placeholder !== "string")) {
                console.error(`Invalid 'reflection' data at key: ${key}`, metaData);
                return false;
            }
        }
        // Validate optional rubric field
        if (metaData.rubric !== undefined) {
            const rubric = metaData.rubric;
            if (typeof rubric !== "object" || typeof rubric.title !== "string") {
                console.error(`Invalid 'rubric' data at key: ${key}`, metaData);
                return false;
            }
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
    }
    return true;
}
// Helper function to validate ChallengeInfo
export function validateChallengeInfo(challenge) {
    if (typeof challenge !== "object") {
        return false;
    }
    return (typeof challenge.aiSuggestion === "object" &&
        challenge.aiSuggestion !== null &&
        typeof challenge.aiSuggestion.originalSentence === "string" &&
        typeof challenge.aiSuggestion.aiImprovedSentence === "string" &&
        typeof challenge.aiSuggestion.aiReasoning === "string" &&
        (challenge.aiDirections === undefined ||
            typeof challenge.aiDirections === "string") &&
        (challenge.aiFeeling === undefined ||
            typeof challenge.aiFeeling === "string") &&
        (challenge.ready === undefined || typeof challenge.ready === "boolean") &&
        (challenge.sentenceStartIndex === undefined ||
            typeof challenge.sentenceStartIndex === "number") &&
        (challenge.sentenceEndIndex === undefined ||
            typeof challenge.sentenceEndIndex === "number"));
}
//# sourceMappingURL=types.js.map