import { ChallengeInfo } from "../common/types";
import { AppContext } from "../stateMachine";

export function getSentenceStartAndEndToChallenge(
  sentenceToFind: string,
  fullText
): {
  currentSentence: string;
  startIndex: number;
  endIndex: number;
} {
  const lowerFullText = fullText.toLowerCase();
  const lowerSentenceToFind = sentenceToFind.toLowerCase();

  const matchStartIndex = lowerFullText.indexOf(lowerSentenceToFind);

  if (matchStartIndex === -1) {
    console.warn(`Sentence not found: "${sentenceToFind}"`);
    return {
      currentSentence: "Failed to find sentence.",
      startIndex: -1,
      endIndex: -1,
    };
  }

  // Step 1: Find the start index of the sentence
  let startIndex = matchStartIndex;
  while (startIndex > 0 && !/[.!?]/.test(fullText[startIndex - 1])) {
    startIndex--;
  }

  if (/["”]/.test(fullText[startIndex])) {
    startIndex++;
  }

  while (startIndex < fullText.length && /\s/.test(fullText[startIndex])) {
    startIndex++;
  }

  // Step 5: Find the end index of the sentence
  let endIndex = matchStartIndex + lowerSentenceToFind.length - 1;
  while (endIndex < fullText.length && !/[.!?]/.test(fullText[endIndex])) {
    endIndex++;
  }
  // Include punctuation and trailing quotation marks
  if (/[.!?]/.test(fullText[endIndex])) {
    endIndex++;
  }
  if (/["”]/.test(fullText[endIndex])) {
    endIndex++;
  }

  // Extract the sentence
  const currentSentence = fullText.substring(startIndex, endIndex).trim();

  return {
    currentSentence,
    startIndex,
    endIndex,
  };
}

export function updateTextCoordinates(context: AppContext) {
  // Validate that each sentence exists at their prescribed coordinates.
  const { challengeArray, currentText } = context.documentMetaData;

  // Updated list of challenges after validation
  const updatedChallenges = challengeArray.map(
    (challengeGroup: ChallengeInfo[]) =>
      challengeGroup.filter((challengeInfo: ChallengeInfo) => {
        const { modifiedSentences, sentenceStartIndex } = challengeInfo;

        // Step 1: Find the sentence in the text.
        const startIndex = currentText.indexOf(modifiedSentences[0]);

        if (startIndex === -1) {
          // Step 2a: If the sentence is not found, remove the challenge.
          console.warn(
            `Challenge sentence not found: "${modifiedSentences[0]}"`
          );
          return false; // Exclude this challenge
        }

        // Step 2b: If the sentence is found, check if the startPosition matches.
        if (sentenceStartIndex !== startIndex) {
          const { startIndex: newStartIndex, endIndex } =
            getSentenceStartAndEndToChallenge(
              modifiedSentences[0],
              currentText
            );

          // Step 3a: Update startPosition and endPosition
          challengeInfo.sentenceStartIndex = newStartIndex;
          challengeInfo.sentenceEndIndex = endIndex;
        }

        // Retain the challenge in the updated list
        return true;
      })
  );

  return updatedChallenges;
}

export function compareNewSentenceToOldSentence(context: AppContext): {
  challengeResponse: "valid" | "tooFar" | "noChanges";
  modifiedSentences: string[];
  modifiedStartIndex: number;
  modifiedEndIndex: number;
} {
  const { currentText, textBeforeEdits, challengeArray } =
    context.documentMetaData;
  const challengeInfo =
    challengeArray[context.documentMetaData.selectedChallengeNumber][0];
  const { modifiedSentences } = challengeInfo;

  const originalSentences = splitIntoSentences(textBeforeEdits);
  const newSentences = splitIntoSentences(currentText);

  // Find differences
  const startIndex = findFirstModifiedIndex(originalSentences, newSentences);
  const endIndex = findLastModifiedIndex(originalSentences, newSentences);

  if (startIndex === -1 || endIndex === -1) {
    return {
      challengeResponse: "noChanges",
      modifiedSentences,
      modifiedStartIndex: 0,
      modifiedEndIndex: 0,
    };
  }

  const newModifiedText = newSentences
    .slice(startIndex, endIndex + 1)
    .join(" ")
    .trim();

  const isFarEdit = newModifiedText.split(/[.!?]+/).length - 1 >= 8;

  let challengeResponse: "valid" | "tooFar" | "noChanges" = "valid";
  if (isFarEdit) {
    challengeResponse = "tooFar";
  } else if (
    newModifiedText === modifiedSentences[modifiedSentences.length - 1]
  ) {
    challengeResponse = "noChanges";
  } else {
    modifiedSentences.push(newModifiedText);
  }

  const newSentenceStartIndex = calculateCharIndex(newSentences, startIndex);
  const newSentenceEndIndex = calculateCharIndex(newSentences, endIndex + 1);

  return {
    challengeResponse,
    modifiedSentences,
    modifiedStartIndex: newSentenceStartIndex,
    modifiedEndIndex: newSentenceEndIndex,
  };

  // Utility Functions

  function splitIntoSentences(text: string): string[] {
    return text.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s.trim()) || [];
  }

  function calculateCharIndex(
    sentences: string[],
    targetIndex: number
  ): number {
    return sentences
      .slice(0, targetIndex)
      .reduce((acc, sentence) => acc + sentence.length + 1, 0);
  }

  function findFirstModifiedIndex(
    original: string[],
    modified: string[]
  ): number {
    return modified.findIndex((sentence, i) => sentence !== original[i]);
  }

  function findLastModifiedIndex(
    original: string[],
    modified: string[]
  ): number {
    for (let i = modified.length - 1; i >= 0; i--) {
      if (modified[i] !== original[original.length - modified.length + i]) {
        return i;
      }
    }
    return -1;
  }
}
