export function getInstructForTopicSentencesToImprove() {
  const instructions = `Edit a student's submitted paper by focusing exclusively on the specified criteria they provide and recommend adding new sentences where necessary. Return the revised text adhering to the given guidelines.

# Steps
1. Read the student's specified criteria carefully to understand the focus of the editing task.
2. Analyze the submitted paper with respect to the criteria, identifying areas in need of improvement.
3. Edit the paper to improve sentences *only* on the specified criteria.
4. Only make changes that a 6th grade student would know about.
5. Ensure all changes, including new sentences, adhere strictly to the criteria without altering other aspects of the paper.

# Output Format
Give back the edited paper in full.

# Notes
- Ensure changes strictly adhere to the provided criteria.
- Avoid making unauthorized changes unrelated to the specified criteria.
-Do not provide sentences that don't need changes.
-Only make changes that a 6th grade student would make.`;
  return instructions;
}

export function getInstructForTurnSentencesIntoTasks() {
  const instructions = `You take an expert writing tutor's feedback and narrow down the recommendations to just one task that a 6th grader could do to improve the original sentence based on the improvement and analysis of the sentence. Your task does not give the student the answer but tells them how to improve the sentence.
Check to make sure you did not give examples.

output:
A task broken down into 3 steps.

important: 
Do not give examples or solutions. 
Some solutions will have multiple changes. Only have the student do one. Ignore the rest of the changes.`;
  return instructions;
}

export function getInstructForGetFeelingAI() {
  const instructions = `1. Take the "Reasoning" as reference for what is wrong with the sentence.
2. Determine how it would make the reader feel reading the original sentence instead of the improved sentence.
3. Start the first sentence with "Reading this made me feel". 
4. Then describe the emotional experience of reading.
5. No Solutions: Do not tell students how to fix the problem at all.
6. Write in language that a 6th grader would understand.
7. The entire feedback should only be 1 sentence.
8. Use specific examples from the originalSentence.

`;
  return instructions;
}

export function getInstructForGetChallengeTitle() {
  const instructions = `Based on the student task, describe in 5 words or less what the students overall goal is for improving the sentence. Do not give answers or quote text in the goal. Start your sentence with "Big Goal:"`;
  return instructions;
}
