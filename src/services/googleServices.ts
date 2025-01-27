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

export async function highlightChallengeSentence(context: AppContext) {
  const { GoogleServices } = context.appState;
  const { docs } = GoogleServices;

  // Get document details
  const doc = await docs.documents.get({
    documentId: context.appState.documentId,
  });

  const startIndex =
    context.documentMetaData.challengeArray[
      context.documentMetaData.selectedChallengeNumber
    ][0].sentenceStartIndex + 1; // +1 because the index is 0 based
  const endIndex =
    context.documentMetaData.challengeArray[
      context.documentMetaData.selectedChallengeNumber
    ][0].sentenceEndIndex + 1; // +1 because the index is 0 based

  const docEndIndex = doc.data.body.content.reduce((acc, element) => {
    if (element.endIndex) {
      return Math.max(acc, element.endIndex);
    }
    return acc;
  }, 0);

  // BatchUpdate request to highlight text
  console.log(startIndex, endIndex);
  const request = {
    requests: [
      // Clear all highlights in the document
      {
        updateTextStyle: {
          range: {
            startIndex: 1, // Start at 1 to avoid the first section break
            endIndex: docEndIndex, // End of the document
          },
          textStyle: {
            backgroundColor: {
              color: null, // Remove any background color
            },
          },
          fields: "backgroundColor",
        },
      },
      // Apply highlight to the desired range
      {
        updateTextStyle: {
          range: {
            startIndex,
            endIndex,
          },
          textStyle: {
            backgroundColor: {
              color: {
                rgbColor: {
                  red: 0.675, // Pale azure blue
                  green: 0.847,
                  blue: 0.902,
                },
              },
            },
          },
          fields: "backgroundColor",
        },
      },
    ],
  };

  try {
    // Send the batchUpdate request
    const response = await docs.documents.batchUpdate({
      documentId: context.appState.documentId,
      requestBody: request,
    });
  } catch (error) {
    console.warn("Error highlighting text:", error);
  }
}
