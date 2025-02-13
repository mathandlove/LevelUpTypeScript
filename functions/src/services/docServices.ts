import { ChallengeInfo, defaultRubric, Rubric } from "../common/types";
import { AppContext } from "../common/appTypes";

export function getSentenceStartAndEnd(
  sentenceToFind: string,
  fullText
): {
  currentSentence: string;
  startIndex: number;
  endIndex: number;
} {
  const lowerFullText = fullText.toLowerCase();
  let lowerSentenceToFind = sentenceToFind.toLowerCase().trim();
  const cleanedSentence = lowerSentenceToFind.replace(
    /^[\s"“”‘’'.,!?;:(){}\[\]]+|[\s"“”‘’'.,!?;:(){}\[\]]+$/g,
    ""
  );
  lowerSentenceToFind = cleanedSentence;
  let matchStartIndex = lowerFullText.indexOf(lowerSentenceToFind);

  //if matchStartIndex is -1, try again with only the 50 first characters of the sentenceToFind, and then try again with only the 25 first characters, and then with the 10 characters. If at any point more than one sentence is found return only the first one.
  if (matchStartIndex === -1) {
    matchStartIndex = lowerFullText.indexOf(
      lowerSentenceToFind.substring(0, 50)
    );
  }

  if (matchStartIndex === -1) {
    matchStartIndex = lowerFullText.indexOf(
      lowerSentenceToFind.substring(0, 25)
    );
  }

  if (matchStartIndex === -1) {
    matchStartIndex = lowerFullText.indexOf(
      lowerSentenceToFind.substring(0, 10)
    );
  }

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

export function compareNewSentenceToOldSentence(context: AppContext): {
  challengeResponse: "valid" | "tooFar" | "noChanges";
  modifiedSentences: string[];
  modifiedStartIndex: number;
  modifiedEndIndex: number;
} {
  const { currentText, textBeforeEdits, currentChallenge } =
    context.documentMetaData;
  const { modifiedSentences } = currentChallenge;

  const originalSentences = splitIntoSentences(textBeforeEdits);
  const newSentences = splitIntoSentences(currentText);

  // Find differences
  let startIndex = findFirstModifiedIndex(originalSentences, newSentences);
  let endIndex = findLastModifiedIndex(originalSentences, newSentences);

  if (startIndex === -1 || endIndex === -1) {
    return {
      challengeResponse: "noChanges",
      modifiedSentences,
      modifiedStartIndex: 0,
      modifiedEndIndex: 0,
    };
  }
  const originalSentence = modifiedSentences[modifiedSentences.length - 1];
  //Find original sentence in new sentences.
  const trimmedNewSentences = newSentences.map((sentence) => sentence.trim());
  const originalSentenceStartIndex =
    trimmedNewSentences.indexOf(originalSentence);
  // Expand threshold to include any overlapping original sentences
  if (originalSentenceStartIndex >= 0) {
    startIndex = Math.min(startIndex, originalSentenceStartIndex);
    endIndex = Math.max(endIndex, originalSentenceStartIndex);
  }

  const newModifiedText = newSentences
    .slice(startIndex, endIndex + 1)
    .join("")
    .trim();

  const isFarEdit =
    newModifiedText.split(/[.!?]+/).length -
      originalSentence.split(/[.!?]+/).length >=
    8;

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
    return text.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s) || [];
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

//RUBRICS ARE FUN!

export async function DeadloadRubric(context: AppContext): Promise<Rubric> {
  //StepA: Make a copy of the StarterLevelUpRubricId

  //Step 3: Open the Google Sheet and extract the topic
  //Step 4: Extract the reflectionTemplate,
  //Step 5: Extract the gradeLevel
  //Step 6: Extract the title
  //Step 7: Return as a Rubric

  //To be done in state Machine
  //Step 7: Install all of this asa RubricinSavedRubric in DocumentMetaData.
  //Step 8: Install the Rubric as currentRubric in DocumentMetaData.
  //Step 9: Subfunction: Calculate how many topics there are in the rubric, and expand both challengeArray and newChallengesArray to match the right size.
  return defaultRubric;
}
