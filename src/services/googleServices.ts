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
