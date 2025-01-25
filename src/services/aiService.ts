import { AppContext } from "../stateMachine";
import { ChallengeInfo } from "../common/types";
import {
  ImprovedSentenceArraySchema,
  validateImprovedSentenceArray,
  ImprovedSentenceArray,
} from "../resources/schemas";
import { getFullText } from "./googleServices";
import {
  getInstructForTurnSentencesIntoTasks,
  getInstructForGeFeelingAI,
  getInstructForTopicSentencesToImprove,
} from "../resources/InstructionsAI.js";
import { chatGPTKey } from "../resources/keys";

export async function addChallengesToChallengeArrays(
  context: AppContext
): Promise<Array<Array<ChallengeInfo>>> {
  const promises = [];

  //Make sure ChallengeInfo is the right size to accept arrays.

  const localChallengeArray = Array.from(
    { length: context.documentMetaData.pills.length },
    (_, i) => context.documentMetaData.challengeArray[i] || [] // Ensure a valid array exists
  );

  for (let i = 0; i < localChallengeArray.length; i++) {
    if (localChallengeArray[i].length < 2) {
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
}
export async function addChallengesToTopic(
  context: AppContext,
  selectTopicNumber: number
): Promise<Array<ChallengeInfo>> {
  // Add the function logic here to return a Promise
  const fullText = await getFullText(context);
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

  if (!validateImprovedSentenceArray(response)) {
    throw new Error("AI returned invalid areas of work");
    //eventually call again.
  } else {
    // Convert improved sentences to ChallengeInfo array
    const challenges: ChallengeInfo[] = response.sentencePair.map(
      (sentence) => ({
        aiSuggestion: {
          originalSentence: sentence.originalSentence,
          aiImprovedSentence: sentence.improvedSentence,
          aiReasoning: sentence.reasoning,
        },
      })
    );
    // Add to your challengeArray
    return challenges;
  }
}

interface OpenAICallResponse {
  response: string;
  cost: number;
  callDuration: number;
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
      console.log(cost);
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
