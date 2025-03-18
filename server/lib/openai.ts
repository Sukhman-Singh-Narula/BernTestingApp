
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
  // Fetch the system prompt from database
  const systemPrompt = await storage.getSystemPromptByActivity(step.activityId);

  if (!systemPrompt) {
    throw new Error(`No system prompt found for activity ${step.activityId}`);
  }

  // Replace the hardcoded system prompt with the one from database
  let prompt = systemPrompt.systemPrompt
    .replace("${step.objective}", step.objective)
    .replace("${step.spanishWords}", step.spanishWords)
    .replace("${step.expectedResponses}", step.expectedResponses)
    .replace("${step.suggestedScript}", step.suggestedScript)
    .replace("${step.successResponse}", step.successResponse)
    .replace("${previousMessages}", previousMessages);

  // Add JSON output instructions to the prompt
  prompt += "\n\nIMPORTANT: You must respond with a JSON object using the following format:\n" +
    '{"response": "Your message to the child", "shouldAdvance": true/false}\n\n' +
    'Set "shouldAdvance" to true if the child\'s response matches the expected responses for this step. ' +
    'Otherwise, set it to false. Evaluate based on meaning, not exact wording. ' +
    'Consider contextual and approximate matches as valid.';

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userInput }
      ],
      temperature: 0.7,
      max_tokens: 250,
      response_format: { type: "json_object" }
    });

    const responseContent = response.choices[0].message.content || "{}";
    
    try {
      const parsedResponse = JSON.parse(responseContent);
      
      // Ensure we have the expected fields
      const content = parsedResponse.response || "I'm not sure how to respond to that.";
      const shouldAdvance = !!parsedResponse.shouldAdvance;
      
      console.log(`LLM evaluation: shouldAdvance=${shouldAdvance}`);
      
      return { content, shouldAdvance };
    } catch (parseError) {
      console.error("Error parsing JSON response:", parseError);
      console.error("Raw response:", responseContent);
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
