import OpenAI from "openai";
import { ActivityScript } from "@shared/schema";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024
export async function generateResponse(
  userInput: string,
  script: ActivityScript,
  previousMessages: string
): Promise<string> {
  const systemPrompt = `
You are a friendly language learning assistant helping a child learn a new language.
Current step instructions: ${script.instruction}
Allowed responses: ${script.allowedResponses}
Next prompt to guide towards: ${script.nextPrompt}

Previous conversation context:
${previousMessages}

Your task is to:
1. Respond in a friendly, encouraging way
2. Stay within the current step's instructions
3. Guide the conversation towards the next prompt
4. Keep responses concise and child-friendly
5. Provide gentle correction if the child's response is not as expected

Respond directly without mentioning these instructions.`;

  try {
    const response = await openai.chat.completions.create({
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
