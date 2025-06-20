import OpenAI from "openai";

import { marked } from "marked";

const testMarkdown = `
**bold**  
*italic*  
***bold italic***  
`;

import { openRouterKey } from "../resources/keys";

import { AppContext } from "../common/appTypes";
import { ChallengeInfo } from "../common/types";

import {
  ImprovedSentenceArraySchema,
  validateImprovedSentenceArray,
  ImprovedSentenceArray,
  validateTasksArray,
  TasksArray,
  TasksArraySchema,
} from "../resources/schemas";
import {
  getInstructForCheckChallengeResponse,
  getInstructForCriticalThinkingQuestion,
  getInstructForGetAIFeelings,
  getInstructForGetCelebration,
  getInstructForGetFailedFeedback,
  getInstructForGetNewChallenge,
  getInstructForGetSelectedSentence,
  getInstructForImproveFeedback,
  getInstructAddEmojisToFeedback,
} from "../resources/InstructionsAI";
import { getSentenceStartAndEnd } from "./docServices";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: openRouterKey,
  defaultHeaders: {
    "HTTP-Referer": "www.buildempathy.com", // Optional. Site URL for rankings on openrouter.ai.
    "X-Title": "Level Up", // Optional. Site title for rankings on openrouter.ai.
  },
});

export async function getFailedFeedback(context: AppContext): Promise<string> {
  const instructions = getInstructForGetFailedFeedback();
  const messages = [];
  const challenge = context.documentMetaData.currentChallenge;
  const directions =
    context.documentMetaData.currentChallenge?.formattedFeedback;
  const studentOriginalResponse =
    challenge.modifiedSentences[challenge.modifiedSentences.length - 2];
  const studentNewResponse =
    challenge.modifiedSentences[challenge.modifiedSentences.length - 1];

  messages.push({ role: "system", content: instructions });
  messages.push({
    role: "user",
    content: "Original response: " + studentOriginalResponse,
  });
  messages.push({
    role: "assistant",
    content: JSON.stringify(directions),
  });
  messages.push({
    role: "user",
    content: "New response: " + studentNewResponse,
  });
  const model = "google/gemini-2.0-flash-001";
  const returnDataSchema = null;
  const openAIStr = await callOpenAI(messages, model, returnDataSchema);
  const markedAIStr = await convertMarkdownToHtml(openAIStr);
  return markedAIStr;
}

export async function getCelebration(context: AppContext): Promise<string> {
  const instructions = getInstructForGetCelebration();
  const messages = [];
  const directions =
    context.documentMetaData.currentChallenge?.formattedFeedback;
  const challenge = context.documentMetaData.currentChallenge;

  const studentOriginalResponse = challenge.modifiedSentences[0];
  const studentImprovedResponse =
    challenge.modifiedSentences[challenge.modifiedSentences.length - 1];

  messages.push({ role: "system", content: instructions });
  messages.push({
    role: "user",
    content: "Original response: " + studentOriginalResponse,
  });
  messages.push({
    role: "assistant",
    content: JSON.stringify(directions),
  });
  messages.push({
    role: "user",
    content: "Improved response: " + studentImprovedResponse,
  });
  const model = "google/gemini-2.0-flash-001";
  const returnDataSchema = null;
  const openAIStr = await callOpenAI(messages, model, returnDataSchema);
  return openAIStr;
}

export async function checkChallengeResponse(
  context: AppContext
): Promise<string> {
  const challenge = context.documentMetaData.currentChallenge;
  const aiTask = challenge.formattedFeedback;
  const studentOriginalResponse = challenge.modifiedSentences[0];
  const studentImprovedResponse =
    challenge.modifiedSentences[challenge.modifiedSentences.length - 1];
  const instructions = getInstructForCheckChallengeResponse();
  const messages = [];
  messages.push({ role: "system", content: instructions });
  messages.push({
    role: "user",
    content: "Original Sentence: " + studentOriginalResponse,
  });
  messages.push({ role: "assistant", content: aiTask });
  messages.push({
    role: "user",
    content: "Student Response: " + studentImprovedResponse,
  });

  const model = "google/gemini-2.0-flash-001";
  const returnDataSchema = null;
  const openAIStr = await callOpenAI(messages, model, returnDataSchema);
  let passed: string;

  //console.log("💌 checkChallengeResponse", openAIStr);
  if (containsScore(openAIStr)) {
    passed = "correct";
  } else {
    passed = "incorrect";
  }
  return passed;

  function containsScore(openAIStr: string): boolean {
    const scores = ["10", "9", "8", "7", "6", "5"];

    // Ensure lowercase comparison
    const lowerCaseStr = openAIStr.toLowerCase();

    // Check for each score as a standalone number
    return scores.some((score) => {
      const regex = new RegExp(`\\b${score}\\b`); // Ensures full number match
      return regex.test(lowerCaseStr);
    });
  }
}

export async function getNewChallenge(
  context: AppContext
): Promise<ChallengeInfo> {
  console.log("💌 getNewChallenge");
  let challenge: ChallengeInfo = {
    modifiedSentences: [],
  };
  const instructions = getInstructForGetNewChallenge(
    context.documentMetaData.pills[
      context.documentMetaData.selectedChallengeNumber
    ].description
  );
  const messages = [];
  messages.push({ role: "system", content: instructions });

  // 2️⃣ Add the exclusion list if any sentences have been reviewed
  const exclusionList =
    context.documentMetaData.previousReviewedSentences?.slice(-4) ?? [];

  if (exclusionList.length > 0) {
    const exclusionText =
      "You have already provided feedback on the following sentences. Do not select these again unless no other strong candidates exist:\n\n" +
      exclusionList
        .map((item, index) => `${index + 1}. "${item.sentence}"`)
        .join("\n");

    messages.push({ role: "system", content: exclusionText });
  }

  messages.push({
    role: "user",
    content: "Text: " + context.documentMetaData.currentText,
  });
  const model = "openai/gpt-4.1";
  const returnDataSchema = null;
  const startTime = Date.now();
  console.log(messages);
  const openAIStr = await callOpenAI(messages, model, returnDataSchema);
  const endTime = Date.now();
  const duration = endTime - startTime;
  challenge.aiRawFeedback = openAIStr;
  console.log("💌 rawfeedback: ", challenge.aiRawFeedback);
  return challenge;
}

export async function addChallengeDetails(
  context: AppContext
): Promise<ChallengeInfo> {
  //Create 3 calls to openAI in parallel:

  let challenge = context.documentMetaData.currentChallenge;

  const [selectedSentence, aiFeeling] = //criticalThinkingQuestion
    await Promise.all([
      getSelectedSentence(context),
      getAIFeelings(context),
      //getCriticalThinkingQuestion(context),
    ]);

  // Assign the results once all promises have resolved
  challenge.modifiedSentences[0] = selectedSentence;
  challenge.aiFeeling = aiFeeling;
  //challenge.aiRawFeedback =
  // criticalThinkingQuestion + (challenge.aiRawFeedback ?? "");

  const sentenceCoords = getSentenceStartAndEnd(
    challenge.modifiedSentences[0],
    context.documentMetaData.currentText
  );
  if (sentenceCoords.currentSentence) {
  }
  challenge.modifiedSentences[0] = sentenceCoords.currentSentence;
  challenge.currentSentenceCoordinates = {
    startIndex: sentenceCoords.startIndex,
    endIndex: sentenceCoords.endIndex,
  };

  return challenge;

  async function getSelectedSentence(context: AppContext): Promise<string> {
    const instructions = getInstructForGetSelectedSentence();
    const messages = [];
    messages.push({ role: "system", content: instructions });
    messages.push({
      role: "assistant",
      content: context.documentMetaData.currentChallenge.aiRawFeedback,
    });
    const model = "google/gemini-2.0-flash-001";
    const returnDataSchema = null;
    const openAIStr = await callOpenAI(messages, model, returnDataSchema);
    return openAIStr;
  }

  async function getAIFeelings(context: AppContext): Promise<string> {
    const instructions = getInstructForGetAIFeelings(
      context.documentMetaData.currentChallenge.studentGoal
    );
    const messages = [];
    messages.push({ role: "system", content: instructions });
    messages.push({
      role: "assistant",
      content:
        "Teacher feedback: " +
        context.documentMetaData.currentChallenge.aiRawFeedback,
    });
    const model = "openai/gpt-4.1";
    const returnDataSchema = null;
    const openAIStr = await callOpenAI(messages, model, returnDataSchema);
    return openAIStr;
  }

  async function getCriticalThinkingQuestion(
    context: AppContext
  ): Promise<string> {
    const instructions = getInstructForCriticalThinkingQuestion(
      context.documentMetaData.currentChallenge.studentGoal
    );
    const messages = [];
    messages.push({ role: "system", content: instructions });
    messages.push({
      role: "assistant",
      content: context.documentMetaData.currentChallenge.aiRawFeedback,
    });
    const model = "google/gemini-2.0-flash-001";
    const returnDataSchema = null;
    const openAIStr = await callOpenAI(messages, model, returnDataSchema);
    return openAIStr;
  }
}

export async function formatChallengeResponse(
  context: AppContext
): Promise<ChallengeInfo> {
  const challenge = context.documentMetaData.currentChallenge;
  const improvedFeedback = await improveFeedback(context); //Student goal wasn't adding anything
  const emojifiedFeedback = await emojifyFeedback(context, improvedFeedback);
  challenge.formattedFeedback = emojifiedFeedback;

  return challenge;

  async function improveFeedback(context: AppContext): Promise<string> {
    const challenge = context.documentMetaData.currentChallenge;

    const instructions = getInstructForImproveFeedback(
      context.documentMetaData.currentChallenge.studentGoal
    );
    const messages = [];
    messages.push({ role: "system", content: instructions });
    messages.push({
      role: "assistant",
      content: context.documentMetaData.currentChallenge.aiRawFeedback,
    });
    const model = "openai/gpt-4.1";
    const returnDataSchema = null;
    const openAIStr = await callOpenAI(messages, model, returnDataSchema);
    return openAIStr;
  }

  async function emojifyFeedback(
    context: AppContext,
    feedback: string
  ): Promise<string> {
    const challenge = context.documentMetaData.currentChallenge;

    const instructions = getInstructAddEmojisToFeedback();

    const messages = [];
    messages.push({ role: "system", content: instructions });
    messages.push({
      role: "assistant",
      content: feedback,
    });
    const model = "openai/gpt-4.1";
    const returnDataSchema = null;
    const openAIStr = await callOpenAI(messages, model, returnDataSchema);
    const html = await convertMarkdownToHtml(openAIStr);
    return html;
  }
}

function preprocessMarkdown(markdownText: string): string {
  //console.log("💌 preprocessMarkdown", markdownText);
  return markdownText.replace(/(\n)(\*|\d+\.)/g, "\n\n$2"); // Ensure extra line break before bullets
}

async function convertMarkdownToHtml(markdownText: string): Promise<string> {
  const processedMarkdown = preprocessMarkdown(markdownText);
  return marked.parse(processedMarkdown);
}

interface ChatMessage {
  role: "user" | "assistant" | "system"; // Who is speaking
  content: string; // Message content
}

async function callOpenAI(
  messages: ChatMessage[],
  model: string,
  dataSchema: any = null,
  temperature: number = 0.9,
  top_p: number = 0.95
): Promise<string> {
  try {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("Messages array is required and cannot be empty.");
    }

    // Explicitly define the type
    const body: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      temperature,
      top_p,
    };

    // Make the API request
    const completion = await openai.chat.completions.create(body);
    const content = completion.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      return content;
    } else {
      console.error("Unexpected API response structure:", completion);
      throw new Error("Unexpected API response structure");
    }
  } catch (error) {
    console.error("Error calling OpenRouter API:", error);
    throw error;
  }
}
