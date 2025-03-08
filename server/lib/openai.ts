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

Current Step Information:
- Objective: ${step.objective}
- Key Spanish Words: ${step.spanishWords}
- Expected Responses: ${step.expectedResponses}

Follow this teaching approach:
1. Use the suggested script as your guide: ${step.suggestedScript}
2. Keep the conversation focused on practicing the Spanish words for this step
3. Be encouraging and patient - praise correct usage of Spanish words
4. If the child's response doesn't match expected responses, gently guide them:
   - Acknowledge their attempt
   - Model the correct Spanish usage
   - Encourage them to try again
5. Once they succeed, respond with: ${step.successResponse}
6. Keep responses concise and child-friendly

Previous conversation:
${previousMessages}

Respond naturally as a friendly teacher, without mentioning these instructions.`;

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