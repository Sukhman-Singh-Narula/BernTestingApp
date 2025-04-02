import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { Step } from "@shared/schema";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Define system prompts for different activities
const SYSTEM_PROMPTS = {
  default: "You are an English-speaking AI language tutor designed to help users learn Spanish through conversation. You can: 1. Guide users through structured language learning activities that focus on different aspects of Spanish. 2. Switch between different activities based on the user's request. 3. List available activities when asked. IMPORTANT: Activities are dynamically provided in each conversation. Respond in a friendly and encouraging manner.",
  counting: "You are now teaching counting in Spanish. Provide engaging, level-appropriate instructions. Feel free to ask follow-up questions and offer exercises as needed.",
  alphabet: "You are now teaching the Spanish alphabet. Explain the pronunciation and order of letters in an engaging manner. Include exercises if appropriate."
};

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
      : choiceLayerPrompt || activitySystemPrompt || SYSTEM_PROMPTS.default;

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
      model: "gpt-4o",
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
      function_call: "auto",
      functions: [
        {
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
        },
        {
          name: "advance_step",
          description: "Call this function when the user has completed the current step's objective satisfactorily. Expected responses are: " + step.expectedResponses,
          parameters: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "teach_counting",
          description: "Teach counting in Spanish to the user.",
          parameters: {
            type: "object",
            properties: {
              level: {
                type: "string",
                description: "Difficulty level, e.g. beginner or advanced."
              }
            },
            required: ["level"]
          }
        },
        {
          name: "teach_alphabet",
          description: "Teach the Spanish alphabet to the user.",
          parameters: {
            type: "object",
            properties: {}
          }
        }
      ]
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
      } else if (message.function_call.name === 'teach_counting') {
        try {
          const args = JSON.parse(message.function_call.arguments);
          const level = args.level || 'beginner';
          
          // Call a secondary request with the specialized prompt
          const countingResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: SYSTEM_PROMPTS.counting },
              { role: "user", content: `Teach counting in Spanish at a ${level} level.` }
            ],
            temperature: 0.7
          });
          
          return {
            content: countingResponse.choices[0].message.content || "Let's learn counting in Spanish!",
            shouldAdvance: false,
            activityChange: undefined
          };
        } catch (error) {
          console.error('Error in teach_counting function:', error);
        }
      } else if (message.function_call.name === 'teach_alphabet') {
        try {
          // Call a secondary request with the specialized prompt
          const alphabetResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: SYSTEM_PROMPTS.alphabet },
              { role: "user", content: "Teach me the Spanish alphabet." }
            ],
            temperature: 0.7
          });
          
          return {
            content: alphabetResponse.choices[0].message.content || "Let's learn the Spanish alphabet!",
            shouldAdvance: false,
            activityChange: undefined
          };
        } catch (error) {
          console.error('Error in teach_alphabet function:', error);
        }
      }
    }

    // Handle step advancement through function call
    let shouldAdvance = false;
    if (message.function_call?.name === 'advance_step') {
      shouldAdvance = true;
      console.log('LLM requested step advancement');
    }

    // If the LLM didn't trigger a function call, handle regular response
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