import { AppContext } from "../stateMachine";
import { ChallengeInfo } from "../common/types";
import {
  ImprovedSentenceArraySchema,
  validateImprovedSentenceArray,
  ImprovedSentenceArray,
  validateTasksArray,
  TasksArray,
  TasksArraySchema,
} from "../resources/schemas";
import { getFullText } from "./googleServices";
import {
  getInstructForTurnSentencesIntoTasks,
  getInstructForTopicSentencesToImprove,
  getInstructForGetFeelingAI,
  getInstructForGetChallengeTitle,
} from "../resources/InstructionsAI.js";
import { chatGPTKey } from "../resources/keys";
import { getSentenceStartAndEndToChallenge } from "./docServices";

export async function addChallengeDetailsToChallengeArray(
  context: AppContext
): Promise<Array<Array<ChallengeInfo>>> {
  const promises = [];
  const localChallengeArray = Array.from(
    { length: context.documentMetaData.pills.length },
    (_, i) => context.documentMetaData.newChallengesArray[i]
  );
  const fullText = context.documentMetaData.currentText;

  for (let i = 0; i < localChallengeArray.length; i++) {
    for (let j = 0; j < localChallengeArray[i].length; j++) {
      const aiOriginalSentence =
        localChallengeArray[i][j].aiSuggestion.originalSentence;
      if (!localChallengeArray[i][j].aiFeeling) {
        promises.push(
          addAIFeelToChallenge(localChallengeArray[i][j].aiSuggestion).then(
            (AIFeelString) => {
              // Safely merge results into the local copy
              localChallengeArray[i][j].aiFeeling = AIFeelString;
            }
          )
        );
      }
      if (true || !localChallengeArray[i][j].sentenceStartIndex)
        promises.push(
          Promise.resolve(
            getSentenceStartAndEndToChallenge(aiOriginalSentence, fullText)
          ).then(({ currentSentence, startIndex, endIndex }) => {
            localChallengeArray[i][j].sentenceInDoc = currentSentence;
            localChallengeArray[i][j].sentenceStartIndex = startIndex;
            localChallengeArray[i][j].sentenceEndIndex = endIndex;
          })
        );

      if (!localChallengeArray[i][j].taskArray)
        promises.push(
          getTasksForChallenge(localChallengeArray[i][j].aiSuggestion).then(
            (tasks) => {
              localChallengeArray[i][j].taskArray = tasks;
            }
          )
        );
      if (!localChallengeArray[i][j].challengeTitle)
        promises.push(
          getChallengeTitle(localChallengeArray[i][j].aiSuggestion).then(
            (challengeTitle) => {
              localChallengeArray[i][j].challengeTitle = challengeTitle;
            }
          )
        );
    }
  }
  await Promise.all(promises);

  //Remove all challenges that have a startIndex of -1, mark all challenges as now ready to be used.
  const filteredChallengeArray = localChallengeArray.map((row) =>
    row.filter((challenge) => {
      if (challenge.sentenceStartIndex === -1) {
        return false;
      }
      return true;
    })
  );
  return filteredChallengeArray;

  async function addAIFeelToChallenge(
    aiFeedback: ChallengeInfo["aiSuggestion"]
  ): Promise<string> {
    const instructions = getInstructForGetFeelingAI();
    const messages = [];
    messages.push({
      role: "system",
      content: instructions,
    });
    messages.push({
      role: "assistant",
      content: JSON.stringify(aiFeedback),
    });
    const returnDataSchema = null;
    const model = "gpt-4o";
    const openAIobj = await callOpenAI(messages, model, returnDataSchema);
    return openAIobj.response;
  }

  async function getTasksForChallenge(
    aiFeedback: ChallengeInfo["aiSuggestion"]
  ): Promise<TasksArray> {
    const instructions = getInstructForTurnSentencesIntoTasks();
    const messages = [];
    messages.push({
      role: "system",
      content: instructions,
    });
    messages.push({
      role: "assistant",
      content: JSON.stringify(aiFeedback),
    });
    const returnDataSchema = TasksArraySchema;
    const model = "gpt-4o";
    const openAIobj = await callOpenAI(messages, model, returnDataSchema);
    let response: TasksArray = JSON.parse(openAIobj.response).tasks;
    if (!validateTasksArray(response)) {
      console.warn("AI returned invalid areas of work");
      response = await getTasksForChallenge(aiFeedback);
    }
    return response;
  }

  async function getChallengeTitle(
    aiFeedback: ChallengeInfo["aiSuggestion"]
  ): Promise<string> {
    const instructions = getInstructForGetChallengeTitle();
    const messages = [];
    messages.push({
      role: "system",
      content: instructions,
    });
    messages.push({
      role: "assistant",
      content: JSON.stringify(aiFeedback),
    });
    const returnDataSchema = null;
    const model = "gpt-4o-mini";
    const openAIobj = await callOpenAI(messages, model, returnDataSchema);
    return openAIobj.response;
  }
}
export async function addChallengesToChallengeArrays(
  context: AppContext
): Promise<Array<Array<ChallengeInfo>>> {
  const promises = [];

  //Make sure ChallengeInfo is the right size to accept arrays.

  const localChallengeArray = Array.from(
    { length: context.documentMetaData.pills.length },
    () => [] // Initialize each element as an empty array
  );

  //When loading doc, we verified the length of the challengeArray.

  for (let i = 0; i < localChallengeArray.length; i++) {
    if (context.documentMetaData.challengeArray[i]?.length < 2) {
      promises.push(
        addChallengesToTopic(context, i).then((challenges) => {
          // Safely merge results into the local copy
          localChallengeArray[i] = challenges;
        })
      );
    }
  }
  await Promise.all(promises);
  return localChallengeArray;

  async function addChallengesToTopic(
    context: AppContext,
    selectTopicNumber: number
  ): Promise<Array<ChallengeInfo>> {
    // Add the function logic here to return a Promise
    const fullText = context.documentMetaData.currentText;
    const selectTopic = context.documentMetaData.pills[selectTopicNumber];
    const selectTopicDescription = selectTopic.description;
    const instructions = getInstructForTopicSentencesToImprove();

    const messages = [];
    messages.push({
      role: "system",
      content: instructions,
    });
    messages.push({
      role: "user",
      content: `Criteria: Edit this paper so it ${selectTopicDescription}. Do not make other edits outside the criteria.\n
      Paper: ${fullText}`,
    });
    const model = "gpt-4o-mini";
    const returnDataSchema = ImprovedSentenceArraySchema;
    const openAIobj = await callOpenAI(messages, model, returnDataSchema);

    let response: ImprovedSentenceArray = await JSON.parse(openAIobj.response);
    let challenges: ChallengeInfo[];
    if (!validateImprovedSentenceArray(response)) {
      console.warn("AI returned invalid areas of work");
      challenges = await addChallengesToTopic(context, selectTopicNumber);
      //eventually call again.
    } else {
      // Convert improved sentences to ChallengeInfo array
      challenges = response.sentencePair.map((sentence) => ({
        aiSuggestion: {
          originalSentence: sentence.originalSentence,
          aiImprovedSentence: sentence.improvedSentence,
          aiReasoning: sentence.reasoning,
        },
      }));
    }
    // Add to your challengeArray
    return challenges;
  }
}

interface OpenAICallResponse {
  response: string;
  callDuration: number;
  cost: number;
}

interface ChatMessage {
  role: "user" | "assistant" | "system"; // Who is speaking
  content: string; // Message content
}

async function callOpenAI(
  messages: ChatMessage[],
  model: string,
  returnDataSchema: any = null
): Promise<OpenAICallResponse> {
  const apiKey = chatGPTKey;

  const url = "https://api.openai.com/v1/chat/completions";
  let body = {};
  if (returnDataSchema) {
    body = {
      model: model,
      messages: messages,
      response_format: returnDataSchema,
    };
  } else {
    body = {
      model: model,
      messages: messages,
    };
  }
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(body),
    headers: {
      Authorization: "Bearer " + apiKey,
    },
    muteHttpExceptions: true,
  };
  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorDetails = await response.json();
      console.error("Error calling OpenAI API:", errorDetails);
      console.error(messages);
      //Need to put in error screen. TODO
      return null;
    }
    const jsonResponse = await response.json();

    const endTime = Date.now();
    if (jsonResponse.choices && jsonResponse.choices.length > 0) {
      const completionTokens = jsonResponse.usage.completion_tokens;
      const promptTokens = jsonResponse.usage.prompt_tokens;

      // Define cost per token for each type
      const costPerCompletionToken = 0.15 / 1000000; // Example cost
      const costPerPromptToken = 0.6 / 1000000; // Example cost
      const cost =
        completionTokens * costPerCompletionToken +
        promptTokens * costPerPromptToken;
      return {
        response: jsonResponse.choices[0].message.content,
        cost,
        callDuration: (endTime - startTime) / 1000,
      };
    } else {
      console.error("Unexpected API response structure:", jsonResponse);
    }
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    throw "We are unable to connect to our AI service. Please try again later.";
  }
}
