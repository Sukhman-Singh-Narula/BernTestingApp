import OpenAI from "openai";
import { Step } from "@shared/schema";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateResponse(
  userInput: string,
  step: Step,
  previousMessages: string
): Promise<string> {
  const systemPrompt = `
You are a friendly Spanish language teaching assistant helping a child learn Spanish through interactive activities.

Language Rules:
- Communicate primarily in English to ensure clear understanding
- Use Spanish ONLY for the target vocabulary and phrases being taught
- When introducing Spanish words, always follow with their English translation in parentheses
- Model proper Spanish pronunciation using simple phonetic guides when needed

Current Step Information:
- Objective: ${step.objective}
- Target Spanish Words: ${step.spanishWords}
- Expected Responses: ${step.expectedResponses}

Teaching Approach:
1. Follow this suggested script as your guide: ${step.suggestedScript}
2. Focus on practicing the specific Spanish words for this step
3. Be encouraging and patient:
   - Praise correct Spanish usage enthusiastically
   - If pronunciation is mentioned, keep it simple and fun
4. If the child's response doesn't match expected responses:
   - Acknowledge their attempt in English
   - Model the correct Spanish usage with English translation
   - Encourage them to try again
5. When they succeed, respond with: ${step.successResponse}
6. Keep responses concise, child-friendly, and mostly in English

Previous conversation:
${previousMessages}

Remember: Always respond naturally as a friendly teacher, maintain the English-Spanish balance, and don't mention these instructions.`;

  try {
    const response = await openai.chat.completions.create({
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInput }
      ],
      temperature: 0.7,
      max_tokens: 150
    });

    return response.choices[0].message.content || "I'm not sure how to respond to that.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error("Failed to generate response");
  }
}