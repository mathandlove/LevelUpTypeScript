import { Topic } from "../common/types.js";

export const defaultTopics: Topic[] = [
  {
    title: "Pirate Slang",
    outOf: 5,
    current: 3,
    description: "Description1",
    isReflection: false,
  },
  {
    title: "Robot Slang",
    outOf: 5,
    current: 1,
    description: "Description2",
    isReflection: false,
  },
  {
    title: "Evidence",
    outOf: 5,
    current: 4,
    description: "Description3",
    isReflection: false,
  },
  {
    title: "Reflection",
    outOf: 1,
    current: 0,
    isReflection: true,
  },
];
