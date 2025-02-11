import OpenAI from "openai";

import { marked } from "marked";

import { openRouterKey } from "../resources/keys.js";

import { AppContext } from "../common/appTypes.js";
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
} from "../resources/InstructionsAI.js";
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
  return openAIStr;
}

export async function getCelebration(context: AppContext): Promise<string> {
  const instructions = getInstructForGetCelebration();
  const messages = [];
  const directions =
    context.documentMetaData.currentChallenge?.formattedFeedback;
  const challenge = context.documentMetaData.currentChallenge;

  const studentOriginalResponse =
    challenge.modifiedSentences[challenge.modifiedSentences.length - 2];
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
  const studentOriginalResponse =
    challenge.modifiedSentences[challenge.modifiedSentences.length - 2];
  const studentImprovedResponse =
    challenge.modifiedSentences[challenge.modifiedSentences.length - 1];
  const instructions = getInstructForCheckChallengeResponse();
  const messages = [];
  messages.push({ role: "system", content: instructions });
  messages.push({ role: "user", content: "1: " + studentOriginalResponse });
  messages.push({ role: "assistant", content: aiTask });
  messages.push({ role: "user", content: "2: " + studentImprovedResponse });

  const model = "google/gemini-2.0-flash-001";
  const returnDataSchema = null;
  const openAIStr = await callOpenAI(messages, model, returnDataSchema);
  let passed: string;
  if (openAIStr.includes("1")) {
    passed = "incorrect";
  } else if (openAIStr.includes("2")) {
    passed = "correct";
  } else {
    passed = "incorrect";
  }
  return passed;
}

export async function getNewChallenge(
  context: AppContext
): Promise<ChallengeInfo> {
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
  messages.push({
    role: "user",
    content: "Text: " + context.documentMetaData.currentText,
  });
  const model = "google/gemini-2.0-flash-001";
  const returnDataSchema = null;
  const startTime = Date.now();
  const openAIStr = await callOpenAI(messages, model, returnDataSchema);
  const endTime = Date.now();
  const duration = endTime - startTime;
  challenge.aiRawFeedback = openAIStr;
  return challenge;
}

export async function addChallengeDetails(
  context: AppContext
): Promise<ChallengeInfo> {
  //Create 3 calls to openAI in parallel:

  let challenge = context.documentMetaData.currentChallenge;

  const [selectedSentence, aiFeeling, criticalThinkingQuestion] =
    await Promise.all([
      getSelectedSentence(context),
      getAIFeelings(context),
      getCriticalThinkingQuestion(context),
    ]);

  // Assign the results once all promises have resolved
  challenge.modifiedSentences[0] = selectedSentence;
  challenge.aiFeeling = aiFeeling;
  challenge.aiRawFeedback =
    criticalThinkingQuestion + (challenge.aiRawFeedback ?? "");

  const sentenceCoords = getSentenceStartAndEnd(
    challenge.modifiedSentences[0],
    context.documentMetaData.currentText
  );
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
      content: context.documentMetaData.currentChallenge.aiRawFeedback,
    });
    const model = "google/gemini-2.0-flash-001";
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
  const improvedFeedback = await improveFeedback(context);
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
    const model = "google/gemini-2.0-flash-001";
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
    const model = "google/gemini-2.0-flash-001";
    const returnDataSchema = null;
    const openAIStr = await callOpenAI(messages, model, returnDataSchema);
    const html = await convertMarkdownToHtml(openAIStr);
    return html;
  }

  function preprocessMarkdown(markdownText: string): string {
    return markdownText.replace(/(\n)(\*|\d+\.)/g, "\n\n$2"); // Ensure extra line break before bullets
  }

  async function convertMarkdownToHtml(markdownText: string): Promise<string> {
    const processedMarkdown = preprocessMarkdown(markdownText);
    return marked.parse(processedMarkdown);
  }
}

interface ChatMessage {
  role: "user" | "assistant" | "system"; // Who is speaking
  content: string; // Message content
}

async function callOpenAI(
  messages: ChatMessage[],
  model: string,
  dataSchema: any = null
): Promise<string> {
  try {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("Messages array is required and cannot be empty.");
    }

    // Explicitly define the type
    const body: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
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
