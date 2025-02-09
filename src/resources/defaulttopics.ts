import { Topic } from "../common/types.js";

export const defaultTopics: Topic[] = [
  {
    title: "Thesis",
    description:
      "Have a clear and specific thesis. All ideas in the essay should work together to support this central argument. The thesis is concise, debatable, and guides the reader through the rest of the paper.",
    outOf: 3,
    current: 0,
    studentGoalArray: [
      "Grab the reader's attention and curiosity.",
      "Make my argument feel focused and impactful.",
      "Make it sound like I know what I am talking about.",
    ],
  },
  {
    title: "Organization",
    description:
      " The essay is logically organized, with a clear introduction, body paragraphs, and conclusion. Each body paragraph should begin with a clear topic sentence and transition smoothly to the next paragraph. The structure should help readers follow the argument and maintain overall clarity.",
    outOf: 3,
    current: 0,
    studentGoalArray: [
      "Make my paper easy to understand.",
      "Make me sound smarter.",
      "Make it so my ideas pop out.",
    ],
  },

  {
    title: "Evidence",
    description:
      "The essay provides sufficient and relevant evidence to support the thesis. Each piece of evidence should be explained or analyzed to show how it reinforces the argument. Clear connections between evidence and the writer's main points are essential.",
    outOf: 3,
    current: 0,
    studentGoalArray: [
      "Make it look like I read the book/did my research.",
      "Make my paper really convincing",
      "Help the reader understand what I am trying to say.",
    ],
  },
  {
    title: "Grammar",
    description:
      "The essay is written in a coherent and fluent style, with appropriate word choice and sentence variety. Grammar, punctuation, and spelling are generally correct.",
    outOf: 3,
    current: 0,
    studentGoalArray: [
      "Make me sound proffesional and educated.",
      "Get rid of the errors in my paper.",
      "Make my paper easy to read.",
    ],
  },
];
