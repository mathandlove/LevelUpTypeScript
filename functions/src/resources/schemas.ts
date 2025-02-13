export interface ImprovedSentenceArray {
  sentencePair: {
    originalSentence: string; // The initial version of the sentence before improvements.
    improvedSentence: string; // The revised version of the sentence with improvements applied.
    reasoning: string; // The rationale for changes made to the sentence.
  }[];
}

export const validateImprovedSentenceArray = (
  data: any
): data is ImprovedSentenceArray => {
  if (!data || typeof data !== "object" || !Array.isArray(data.sentencePair)) {
    return false; // The data must be an object with a sentencePair array.
  }

  for (const item of data.sentencePair) {
    if (
      typeof item !== "object" ||
      typeof item.originalSentence !== "string" ||
      typeof item.improvedSentence !== "string" ||
      typeof item.reasoning !== "string"
    ) {
      return false; // Each item must have the required properties of the correct type.
    }
  }

  return true; // The data matches the structure.
};

export const cleanImprovedSentenceArray = (
  data: ImprovedSentenceArray
): ImprovedSentenceArray => {
  // Filter the sentencePair array to remove invalid or unnecessary items.
  const cleanedSentencePair = data.sentencePair.filter((item) => {
    // Remove items where originalSentence is blank or where originalSentence equals improvedSentence.
    return (
      item.originalSentence.trim() !== "" &&
      item.originalSentence !== item.improvedSentence &&
      item.originalSentence != "N/A" &&
      item.originalSentence != "NA"
    );
  });

  // Return the cleaned data.
  return {
    sentencePair: cleanedSentencePair,
  };
};

export const ImprovedSentenceArraySchema = {
  type: "json_schema",
  json_schema: {
    name: "dataSchema",
    strict: true,
    schema: {
      type: "object",
      properties: {
        sentencePair: {
          type: "array",
          description:
            "An array of objects containing original and improved sentences with reasoning for changes.",
          items: {
            type: "object",
            properties: {
              originalSentence: {
                type: "string",
                description:
                  "The initial version of the sentence before improvements.",
              },
              improvedSentence: {
                type: "string",
                description:
                  "The revised version of the sentence with improvements applied.",
              },
              reasoning: {
                type: "string",
                description: "The rationale for changes made to the sentence.",
              },
            },
            required: ["originalSentence", "improvedSentence", "reasoning"],
            additionalProperties: false,
          },
        },
      },
      required: ["sentencePair"],
      additionalProperties: false,
    },
  },
};

export const TasksArraySchema = {
  type: "json_schema",
  json_schema: {
    name: "student_task",
    strict: true,
    schema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          description:
            "An array containing exactly 3 tasks that the student must complete.",
          items: {
            type: "string",
            description: "A specific task assigned to the student.",
          },
        },
      },
      required: ["tasks"],
      additionalProperties: false,
    },
  },
};

export type TasksArray = string[];

export const validateTasksArray = (data: any): data is TasksArray => {
  // Check if `data` is an array
  if (!Array.isArray(data)) {
    return false;
  }

  // Check if the array has exactly 3 elements
  if (data.length !== 3) {
    return false;
  }

  // Check if all elements in the array are strings
  if (data.some((task) => typeof task !== "string")) {
    return false;
  }

  return true;
};
