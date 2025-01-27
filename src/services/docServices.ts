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

  console.log("challengeArray: ", challengeArray);

  // Updated list of challenges after validation
  const updatedChallenges = challengeArray.map(
    (challengeGroup: ChallengeInfo[]) =>
      challengeGroup.filter((challengeInfo: ChallengeInfo) => {
        const { sentenceInDoc, sentenceStartIndex } = challengeInfo;

        // Step 1: Find the sentence in the text.
        const startIndex = currentText.indexOf(sentenceInDoc);

        if (startIndex === -1) {
          // Step 2a: If the sentence is not found, remove the challenge.
          console.warn(`Challenge sentence not found: "${sentenceInDoc}"`);
          return false; // Exclude this challenge
        }

        // Step 2b: If the sentence is found, check if the startPosition matches.
        if (sentenceStartIndex !== startIndex) {
          const { startIndex: newStartIndex, endIndex } =
            getSentenceStartAndEndToChallenge(sentenceInDoc, currentText);

          // Step 3a: Update startPosition and endPosition
          challengeInfo.sentenceStartIndex = newStartIndex;
          challengeInfo.sentenceEndIndex = endIndex;
        }

        // Retain the challenge in the updated list
        return true;
      })
  );

  // Update the context with validated and corrected challenges
  console.log("updatedChallenges: ", updatedChallenges);

  return updatedChallenges;
}
