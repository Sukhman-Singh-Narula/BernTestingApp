
import OpenAI from "openai";
import { Step } from "@shared/schema";
import { storage } from "../storage";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateResponse(
  userInput: string,
  step: Step,
  previousMessages: string
): Promise<{ content: string; shouldAdvance: boolean }> {
  const systemPrompt = await storage.getSystemPromptByActivity(step.activityId);

  if (!systemPrompt) {
    throw new Error(`No system prompt found for activity ${step.activityId}`);
  }

  // Base teaching approach that remains constant
  const basePrompt = `You are an English-speaking AI language tutor designed to help users learn Spanish through conversation.

Teaching Approach:
1. You are teaching children that speak English primarily. The lesson is conducted in English with Spanish vocabulary introduced gently.
2. Be encouraging and patient:
   - Praise correct Spanish usage enthusiastically
   - Keep pronunciation simple and fun
3. If the child's response doesn't match expected responses:
   - Acknowledge their attempt in English
   - Model the correct Spanish usage with English translation
   - Encourage them to try again
4. When they succeed, respond with affirmation.
5. Keep responses concise and child-friendly`;

  // Activity-specific context
  const activityContext = `\nThis is a racing game activity where the user is a driver in a Grand Prix race.
Current objective: ${step.objective}
Spanish words to practice: ${step.spanishWords || 'None for this step'}
Expected responses: ${step.expectedResponses}
Previous conversation: ${previousMessages}`;

  // Combine prompts with error checking
  const finalPrompt = `${basePrompt}\n${activityContext}\n${systemPrompt.systemPrompt}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: finalPrompt },
        { role: "user", content: userInput }
      ],
      temperature: 0.7,
      max_tokens: 250,
      response_format: { type: "json_object" }
    });

    const responseContent = response.choices[0].message.content || "{}";
    
    try {
      const parsedResponse = JSON.parse(responseContent);
      const content = parsedResponse.response || "I'm not sure how to respond to that.";
      const shouldAdvance = !!parsedResponse.shouldAdvance;
      
      console.log(`LLM evaluation: shouldAdvance=${shouldAdvance}`);
      
      return { content, shouldAdvance };
    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError);
      return { 
        content: "I'm having trouble understanding. Can you try again?", 
        shouldAdvance: false 
      };
    }
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error("Failed to generate response");
  }
}
