export function getInstructForCheckChallengeResponse() {
  const instructions = `A student wrote an original sentence and then a tutor gave that student directions. The student then wrote a response to the directions. Your job is to determine if the student followed the directions. Return a number 1 - 10 based on how well the student followed the directions. 1 being they made no changes. 10 being they made all the changes. Only return the number.`;
  return instructions;
}

export function getInstructForGetCelebration() {
  const instructions = `A student followed instructions, improving a sentence. In one short sentence, at a 6th grade reading level, compliment the student on how they improved teh sentence. Driectly reference the text they added to the sentence.`;
  return instructions;
}

export function getInstructForGetFailedFeedback() {
  const instructions = `A student failed to follow instructions improving a sentence. In one short sentence, at a 6th grade reading level, explain to the student why they failed and one small, specific thing they should do. Drirectly reference the text they added to the sentence.`;
  return instructions;
}

export function getInstructForGetNewChallenge(rubricCriteria: string) {
  const instructions = `Review my paper and find one small part (1-3 sentences) where ${rubricCriteria} can be improved. First give me the exact quote of the sentences needed to be improved. Start with "Quote: " and then the sentences. Start the next section with "Feedback: " Then, in simple language suitable for a 5th grade student, explain why that part needs to be fixed. Only give one task for the student to complete.  Do not show me a revised sentence or any examples. Only tell me what to change and how to change it`;
  return instructions;
}

export function getInstructForGetSelectedSentence() {
  const instructions = `Give me the sentence or sentences that you referenced in the feedback. Only give me those sentences, no introduction or concluding remarks. Only give the raw sentences.`;
  return instructions;
}

export function getInstructForGetAIFeelings(studentGoal: string) {
  const instructions = `Write a 2 sentence response describing how reading these sentences would feel to a reader. Write at a 5th grade level in first person. Start with "Reading this part, I felt" Do not suggest ways to improve. Do not mention the sentence. Do not give answers. Only tell how you feel.`;
  return instructions;
}

export function getInstructForCriticalThinkingQuestion(studentGoal: string) {
  const instructions = `Give a question to for the beginning of the feedback to encourage me to critically think. Make the question appropriate for a 5th grade student. Only give the question, no introduction or previous feedback.`;
  return instructions;
}

export function getInstructForImproveFeedback(studentGoal: string) {
  const instructions = `Improve your feedback as if you were an excellent tutor for a 5th grade student. Do not provide answers or examples. Only ask the student to improve *ONE THING*. Add lots of emojis, new lines, and bullets in this feedback to make it easier and fun to read. Frame the feedback around the students goals, "${studentGoal}". Do not mention that you are "improving feedback"`;
  return instructions;
}

export function getInstructAddEmojisToFeedback() {
  const instructions = `Add lots of emojis, bold, italliacs, and new lines in this feedback to make it easier and fun to read. If you list things add bullets. Do not add any new words to the feedback: it should be the same feedback as before. Return ONLY the revised text. No intros, no explanations, no formatting descriptions—just the text.`;
  return instructions;
}
