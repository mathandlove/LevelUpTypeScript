import { ChallengeInfo } from "../common/types";
import { AppContext } from "../stateMachine";

export async function getFullText(context: AppContext): Promise<string> {
  const { GoogleServices } = context.appState;
  const { docs } = GoogleServices;
  const response = await docs.documents.get({
    documentId: context.appState.documentId,
  });

  const body = response.data.body?.content;

  if (!body) {
    throw new Error("You need text in this document to edit it!");
  }
  const text = body
    .map((element) => {
      if (element.paragraph?.elements) {
        return element.paragraph.elements
          .map((elem) => elem.textRun?.content || "")
          .join("");
      }
      return "";
    })
    .join("");

  return text;
}

export async function addFullSentencesToChallenges(
  context: AppContext
): Promise<Array<Array<ChallengeInfo>>> {
  const { GoogleServices } = context.appState;
  const { docs } = GoogleServices;
  const documentId = context.appState.documentId;

  if (!docs || !documentId) {
    throw new Error("Google Docs service or document ID is missing.");
  }

  // Fetch the full text of the document
  const doc = await docs.documents.get({ documentId });

  if (!doc.data.body || !doc.data.body.content) {
    throw new Error("Unable to fetch document content.");
  }

  const fullText = doc.data.body.content
    .map(
      (element) =>
        element.paragraph?.elements?.map((e) => e.textRun?.content).join("") ||
        ""
    )
    .join("");

  if (!fullText) {
    throw new Error("Document is empty or content could not be retrieved.");
  }

  // Add full sentences to challenges
  const { challengeArray } = context.documentMetaData;

  if (!Array.isArray(challengeArray) || challengeArray.length === 0) {
    throw new Error("Challenge array is empty or invalid.");
  }

  challengeArray.forEach((challengeRow) => {
    challengeRow.forEach((challenge) => {
      if (
        challenge.aiSuggestion.originalSentence &&
        challenge.sentenceStartIndex === null
      ) {
        const sentenceInfo = findSentencePositions(
          fullText,
          challenge.aiSuggestion.originalSentence
        );

        if (sentenceInfo) {
          challenge.aiSuggestion.originalSentence =
            sentenceInfo.currentSentence;
          challenge.sentenceStartIndex = sentenceInfo.sentenceStartIndex;
          challenge.sentenceEndIndex = sentenceInfo.sentenceEndIndex;
        } else {
          challenge.aiSuggestion.originalSentence = "Error: Sentence not found";
          console.warn(
            `Starter sentence not found: ${challenge.aiSuggestion.originalSentence}`
          );
        }
      }
    });
  });

  //remove challenges with sentences we cannot find.
  challengeArray.forEach((challengeRow, rowIndex) => {
    // Filter the challenges in each row to remove invalid ones
    challengeArray[rowIndex] = challengeRow.filter((challenge) => {
      if (
        challenge.aiSuggestion.originalSentence === "Error: Sentence not found"
      ) {
        console.warn(
          `Removing invalid challenge: ${challenge.aiSuggestion.originalSentence}`
        );
        return false; // Exclude this challenge
      }
      return true; // Keep valid challenges
    });
  });

  // Save the updated challenge array back to context
  context.documentMetaData.challengeArray = challengeArray;
  console.log(challengeArray);
  return challengeArray;
}

function findSentencePositions(
  fullText: string,
  sentenceToFind: string
): {
  currentSentence: string;
  sentenceStartIndex: number;
  sentenceEndIndex: number;
} | null {
  const lowerFullText = fullText.toLowerCase();
  const lowerSentenceToFind = sentenceToFind.toLowerCase();

  const startIndex = lowerFullText.indexOf(lowerSentenceToFind);

  if (startIndex === -1) {
    return null;
  }

  // Find end of current sentence
  let endIndex = startIndex + sentenceToFind.length;
  while (endIndex < fullText.length) {
    const currentChar = fullText[endIndex];
    const nextChar = fullText[endIndex + 1] || "";

    if (
      (".!?\n".includes(currentChar) && nextChar !== '"') ||
      (".!?".includes(currentChar) &&
        nextChar === '"' &&
        !/[a-zA-Z]/.test(fullText[endIndex + 2] || ""))
    ) {
      endIndex += nextChar === '"' ? 2 : 1;
      break;
    }
    endIndex++;
  }

  return {
    currentSentence: fullText.substring(startIndex, endIndex).trim(),
    sentenceStartIndex: startIndex,
    sentenceEndIndex: endIndex,
  };
}
