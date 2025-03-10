import OpenAI from "openai";
import { Step } from "@shared/schema";
import { storage } from "../storage";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

import { evaluateResponse } from './patronus';

export async function generateResponse(
  userInput: string,
  step: Step,
  previousMessages: string
): Promise<string> {
  // Fetch the system prompt from database
  const systemPrompt = await storage.getSystemPromptByActivity(step.activityId);

  if (!systemPrompt) {
    throw new Error(`No system prompt found for activity ${step.activityId}`);
  }

  // Replace the hardcoded system prompt with the one from database
  const prompt = systemPrompt.systemPrompt
    .replace("${step.objective}", step.objective)
    .replace("${step.spanishWords}", step.spanishWords)
    .replace("${step.expectedResponses}", step.expectedResponses)
    .replace("${step.suggestedScript}", step.suggestedScript)
    .replace("${step.successResponse}", step.successResponse)
    .replace("${previousMessages}", previousMessages);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userInput }
      ],
      temperature: 0.7,
      max_tokens: 150
    });

    const aiResponse = response.choices[0].message.content || "I'm not sure how to respond to that.";
    
    // Log the interaction to Patronus for evaluation
    await evaluateResponse(userInput, aiResponse, step, {
      systemPrompt: prompt,
      previousMessages: previousMessages
    });
    
    return aiResponse;
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error("Failed to generate response");
  }
}