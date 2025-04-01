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
        description: "Detect when users express interest in starting or switching to a specific activity, either by direct mention or implied intent. Use activity IDs from the AVAILABLE_ACTIVITIES list provided in the system prompt.",
        parameters: {
          type: "object",
          required: ["activityId"],
          properties: {
            activityId: {
              type: "integer",
              description: "The ID of the activity to switch to, based on the AVAILABLE_ACTIVITIES list. Ensure the ID exists in the available activities."
            }
          }
        }
      }]
    });

    const message = response.choices[0].message;
    
    // Handle function call if present
    if (message.function_call) {
      if (message.function_call.name === 'change_activity') {
        try {
          const args = JSON.parse(message.function_call.arguments);
          if (args.activityId) {
            // Activity ID found, trigger activity change
            return {
              content: message.content || `Great choice! Let's switch to a new activity.`,
              shouldAdvance: false,
              activityChange: args.activityId
            };
          }
        } catch (error) {
          console.error('Error parsing function call arguments:', error);
        }
      }
    }

    // Check for step advancement when not changing activities
    let shouldAdvance = false;
    if (step.expectedResponses) {
      const expectedResponses = step.expectedResponses.split('|').map(r => r.trim().toLowerCase());
      shouldAdvance = expectedResponses.some(response => 
        userInput.toString().toLowerCase().includes(response)
      );
    }

    // If the LLM didn't trigger a function call for activity change, handle regular response
    const activities = await storage?.getAllVisibleActivities() || [];
    let responseContent = message.content;
    
    // Only use fallbacks if no content provided
    if (!responseContent) {
      if (shouldAdvance) {
        responseContent = step.successResponse;
      }
      if (!responseContent) {
        responseContent = `Welcome! ${step.objective}`;
      }
    }

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