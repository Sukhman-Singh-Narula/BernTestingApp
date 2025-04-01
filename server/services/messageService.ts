import { storage } from '../storage';
import { generateResponse } from '../lib/openai';
import { MessageRole, InsertMessage, Activity } from '@shared/schema';
import { EventEmitter } from 'events';
import { z } from 'zod';

// Create a global event emitter for real-time message updates
export const messageEvents = new EventEmitter();
// Set higher limit for event listeners
messageEvents.setMaxListeners(100);

export class MessageService {
  async createMessage(conversationId: number, message: string) {
    // Validate conversation ID
    if (!conversationId || isNaN(conversationId) || conversationId <= 0) {
      throw new Error(`Invalid conversation ID: ${conversationId}`);
    }

    // Get conversation
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Get current step
    const step = await storage.getStepByActivityAndNumber(
      conversation.activityId,
      conversation.currentStep
    );

    if (!step) {
      throw new Error("Activity step not found");
    }

    // Store user message immediately
    const userMessage = await storage.createMessage({
      conversationId,
      stepId: step.id,
      role: "user" as MessageRole,
      content: message
    });

    // Notify clients about the user message
    messageEvents.emit('message', {
      type: 'user-message',
      conversationId,
      message: userMessage
    });

    // Start AI response generation in the background
    this.generateAIResponse(conversationId, message, step, conversation);

    // Return immediately with user message
    return {
      message: "Processing response...",
      userMessage,
      processing: true,
      conversation: {
        ...conversation,
        messages: [userMessage]
      }
    };
  }

  private async generateAIResponse(conversationId: number, userMessage: string, step: any, conversation: any) {
    try {
      // Get previous messages for context
      const existingMessages = await storage.getMessagesByConversation(conversationId);
      const previousMessages = existingMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Emit "thinking" status event
      messageEvents.emit('message', {
        type: 'thinking',
        conversationId,
        message: "The assistant is thinking..."
      });

      // Get the current step for the conversation
      const currentConversation = await storage.getConversation(conversationId);
      if (!currentConversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const step = await storage.getStepByActivityAndNumber(
        currentConversation.activityId,
        currentConversation.currentStep
      );

      if (!step) {
        console.error(`No step found for activity ${currentConversation.activityId} step ${currentConversation.currentStep}`);
        throw new Error('Step not found');
      }

      console.log('Current step data:', {
        activityId: step.activityId,
        stepNumber: step.stepNumber,
        description: step.description,
        objective: step.objective
      });


      // Generate AI response with evaluation
      const currentConversationWithPrompts = await storage.getConversationWithSystemPrompt(conversationId);
      const systemPromptText = currentConversationWithPrompts?.systemPrompt?.systemPrompt || "";
      const choiceLayerPromptText = currentConversationWithPrompts?.choiceLayerPrompt?.systemPrompt || "";

      const aiResponseData = await generateResponse({
        userInput: userMessage,
        step: step,
        previousMessages,
        choiceLayerPrompt: choiceLayerPromptText,
        activitySystemPrompt: systemPromptText,
        conversationId,
        storage
      });

      // Extract content, advancement decision, and activity change
      const aiResponse = aiResponseData.content;
      const shouldAdvance = aiResponseData.shouldAdvance;
      const activityChange = aiResponseData.activityChange;

      console.log(`LLM decision - shouldAdvance: ${shouldAdvance}, activityChange: ${activityChange}`);

      // Validate step advancement after AI generation
      const validateStepAdvancement = (aiResponseData: any) => {
        if (!step.expectedResponses) return aiResponseData.shouldAdvance;

        const expectedResponses = step.expectedResponses.split('|').map(r => r.trim().toLowerCase());
        const normalizedMessage = userMessage.trim().toLowerCase();
        const matchesExpected = expectedResponses.some(response => normalizedMessage.includes(response));

        return matchesExpected || aiResponseData.shouldAdvance;
      };

      const finalShouldAdvance = validateStepAdvancement(aiResponseData);

      // Store assistant message with metadata
      // Ensure we have valid content before creating the message
      if (!aiResponse) {
        throw new Error("No response content generated");
      }

      // Get the correct step for the current/new activity
      let stepForMessage;
      if (activityChange) {
        // First try to get step 0, fallback to step 1 if not found
        stepForMessage = await storage.getStepByActivityAndNumber(activityChange, 0) || 
                        await storage.getStepByActivityAndNumber(activityChange, 1);

        if (!stepForMessage) {
          throw new Error(`No initial step found for activity ${activityChange}`);
        }
      } else {
        stepForMessage = step;
      }

      const assistantMessage = await storage.createMessage({
        conversationId,
        stepId: stepForMessage.id,
        role: "assistant" as MessageRole,
        content: aiResponse,
        metadata: {
          shouldAdvance: finalShouldAdvance,
          activityChange: activityChange || null
        }
      } as any); // Using 'any' to handle the RecordObject vs string type discrepancy

      // Track conversation updates
      let updatedConv = currentConversation;

      // Handle activity change if requested
      if (activityChange && activityChange !== currentConversation.activityId) {
        try {
          // Verify that the activity exists
          const newActivity = await storage.getActivity(activityChange);
          if (!newActivity) {
            console.error(`Cannot change to non-existent activity ID: ${activityChange}`);
          } else {
            // Update the conversation with the new activity
            updatedConv = await storage.updateConversationActivity(
              conversationId,
              activityChange,
              currentConversation.activityId // Store current activity as previous
            );

            console.log(`Switched conversation ${conversationId} from activity ${currentConversation.activityId} to ${activityChange}`);

            // Get the first step of the new activity to include in the response
            const firstStep = await storage.getStepByActivityAndNumber(activityChange, 1);
            if (firstStep) {
              // Create a system message indicating the activity change
              const systemMetadata = { activitySwitch: true };
              await storage.createMessage({
                conversationId,
                stepId: firstStep.id,
                role: "system" as MessageRole,
                content: `Switched to activity: ${newActivity.name}`,
                metadata: systemMetadata
              } as any); // Using 'any' to handle the RecordObject vs string type discrepancy
            }
          }
        } catch (error) {
          console.error('Error changing activity:', error);
        }
      }
      // If no activity change but should advance step
      else if (finalShouldAdvance) {
        const nextStep = currentConversation.currentStep + 1;
        try {
          updatedConv = await storage.updateConversationStep(
            conversationId,
            nextStep
          );
          console.log(`Advanced conversation ${conversationId} to step ${nextStep}`);
        } catch (error) {
          console.error('Error updating conversation step:', error);
          throw error;
        }
      }

      // Notify clients about the AI response with updated conversation state
      messageEvents.emit('message', {
        type: 'ai-response',
        conversationId,
        message: assistantMessage,
        conversation: updatedConv,
        stepAdvanced: finalShouldAdvance,
        activityChanged: activityChange !== undefined && activityChange !== currentConversation.activityId
      });

    } catch (error) {
      console.error('Error generating AI response:', error);
      // Notify clients about the error
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate response';
      messageEvents.emit('message', {
        type: 'error',
        conversationId,
        error: errorMessage
      });
    }
  }

  /**
   * Get all available activities with detailed information
   * This can be used to dynamically inform the user about available activities
   */
  async getAvailableActivitiesInfo(): Promise<{
    activities: Array<{
      id: number;
      name: string; 
      description: string;
      language: string;
      contentType: string;
      stepCount: number;
      conversationCount: number;
    }>
  }> {
    console.log("Getting detailed activity information for dynamic selection");

    // Get all visible activities
    const activitiesWithCounts = await storage.getAllVisibleActivitiesWithConversationCounts();
    console.log(`Found ${activitiesWithCounts.length} visible activities`);

    // Get step counts for each activity
    const activitiesWithDetails = await Promise.all(
      activitiesWithCounts.map(async (activity) => {
        const steps = await storage.getStepsByActivity(activity.id);
        const details = {
          id: activity.id,
          name: activity.name,
          // Generate description from the activity name and content type since it doesn't exist in the Activity schema
          description: `${activity.name} (${activity.contentType})`,
          language: activity.language || 'Spanish', // Default to Spanish
          contentType: activity.contentType,
          stepCount: steps.length,
          conversationCount: activity.conversationCount
        };

        console.log(`Activity ${activity.id}: ${details.name}, ${details.stepCount} steps, ${details.conversationCount} conversations`);
        return details;
      })
    );

    console.log("Prepared detailed activity information for response");
    return { activities: activitiesWithDetails };
  }

  // Method to handle SSE connections
  setupSSEConnection(req: any, res: any, conversationId: number) {
    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Helper to send events
    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send initial connection established event
    console.log(`SSE: New connection established for conversation ${conversationId}`);
    sendEvent('connected', { conversationId });

    // Message event handler
    const messageHandler = (data: any) => {
      if (data.conversationId === conversationId) {
        console.log(`SSE: Sending ${data.type} event for conversation ${conversationId}:`, data);
        sendEvent(data.type, data);
      }
    };

    // Listen for message events
    messageEvents.on('message', messageHandler);

    // Handle client disconnect
    req.on('close', () => {
      messageEvents.removeListener('message', messageHandler);
    });
  }
}

export default new MessageService();