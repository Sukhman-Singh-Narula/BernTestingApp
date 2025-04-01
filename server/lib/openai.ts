import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { Step } from "@shared/schema";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface ResponseOptions {
  userInput: string | number;
  step: Step;
  previousMessages?: ChatCompletionMessageParam[];
  choiceLayerPrompt?: string;
  activitySystemPrompt?: string;
  conversationId?: number;
  storage?: IStorage;
}

export async function generateResponse(options: ResponseOptions) {
  const {
    userInput,
    step,
    previousMessages = [],
    choiceLayerPrompt = "",
    activitySystemPrompt = "",
    conversationId,
    storage
  } = options;

  try {
    const systemPrompt = choiceLayerPrompt && activitySystemPrompt 
      ? `${choiceLayerPrompt}\n\n${activitySystemPrompt}`
      : choiceLayerPrompt || activitySystemPrompt || "You are a helpful assistant";

    // Fetch available activities
    const availableActivities = storage ? await storage.getAllVisibleActivities() : [];
    const activitiesList = availableActivities.map(a => `${a.id}. ${a.name}: ${a.contentType}`).join('\n');

    const stepDetails = `
Description: ${step.description}
Objective: ${step.objective}
Suggested Script: ${step.suggestedScript}
Spanish Words: ${step.spanishWords}
Expected Responses: ${step.expectedResponses}
Success Response: ${step.successResponse}
`;

    const messages: ChatCompletionMessageParam[] = [
      { 
        role: "system", 
        content: `${systemPrompt}\n\nCURRENT_STEP_DETAILS:\n${stepDetails}\n\nAVAILABLE_ACTIVITIES:\n${activitiesList}`
      },
      ...(Array.isArray(previousMessages) ? previousMessages : []),
      { role: "user", content: String(userInput) }
    ];

    console.log(`Generating response for conversation ${conversationId}`, {
      userInput,
      messagesCount: messages.length
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
      function_call: "auto",
      functions: [{
        name: "change_activity",
        description: "Change to a different activity when user selects one",
        parameters: {
          type: "object",
          properties: {
            activityId: {
              type: "integer",
              description: "ID of the activity to change to (1 for Race Game, 2 for Spanish Basics)"
            }
          }
        }
      }]
    });

    const message = response.choices[0].message;

    // Always check for activity switch requests regardless of current activity
    const activities = await storage?.getAllVisibleActivities() || [];
    const normalizedInput = userInput.toString().toLowerCase();

    // Check user input against each activity first
    for (const activity of activities) {
      if (normalizedInput.includes(activity.name.toLowerCase())) {
        return {
          content: `Great choice! Let's get started with ${activity.name}. We'll help you learn Spanish through ${activity.contentType}!`,
          shouldAdvance: false,
          activityChange: activity.id
        };
      }
    }

    // If not switching activities, check for step advancement
    let shouldAdvance = false;
    if (step.expectedResponses) {
      const expectedResponses = step.expectedResponses.split('|').map(r => r.trim().toLowerCase());
      shouldAdvance = expectedResponses.some(response => normalizedInput.includes(response));
    }

    // Generate the response content
    const responseContent = shouldAdvance 
      ? (step.successResponse || message.content)
      : (message.content || `Welcome! ${step.objective}`);

    // Return final response with advancement decision
    return {
      content: responseContent,
      shouldAdvance,
      activityChange: undefined
    };
  } catch (error) {
    console.error("Error in generateResponse:", error);
    throw error;
  }
}