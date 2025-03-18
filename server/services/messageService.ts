import { storage } from '../storage';
import { generateResponse } from '../lib/openai';
import { MessageRole } from '@shared/schema';
import { EventEmitter } from 'events';

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
      // Get previous messages for context (limit to last 10 for performance)
      const existingMessages = await storage.getMessagesByConversation(conversationId);
      const previousMessages = existingMessages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join("\n");

      // Emit "thinking" status event
      messageEvents.emit('message', {
        type: 'thinking',
        conversationId,
        message: "The assistant is thinking..."
      });

      // Generate AI response
      const aiResponse = await generateResponse(
        userMessage,
        step,
        previousMessages
      );

      // Store assistant message
      const assistantMessage = await storage.createMessage({
        conversationId,
        stepId: step.id,
        role: "assistant" as MessageRole,
        content: aiResponse
      });

      // Check if we should advance to next step based on expected responses
      let shouldAdvance = false;
      let updatedConversation = conversation;

      if (step.expectedResponses) {
        const expectedResponses = step.expectedResponses.split('|').map((r: string) => r.trim().toLowerCase());
        const normalizedMessage = userMessage.trim().toLowerCase();
        
        // Log expected responses and actual message for debugging
        console.log('Expected responses:', expectedResponses);
        console.log('Normalized user message:', normalizedMessage);
        
        shouldAdvance = expectedResponses.some(response => {
          const matches = normalizedMessage.includes(response);
          console.log(`Checking response "${response}": ${matches ? 'matched' : 'no match'}`);
          return matches;
        });
        
        console.log('Step should advance:', shouldAdvance);

        // Update conversation step if response matches expected
        if (shouldAdvance) {
          const nextStep = conversation.currentStep + 1;
          try {
            updatedConversation = await storage.updateConversationStep(
              conversationId,
              nextStep
            );
            console.log(`Advanced conversation ${conversationId} to step ${nextStep}`);
          } catch (error) {
            console.error('Error updating conversation step:', error);
            throw error;
          }
        }
      }

      // Notify clients about the AI response with updated conversation state
      messageEvents.emit('message', {
        type: 'ai-response',
        conversationId,
        message: assistantMessage,
        conversation: updatedConversation,
        stepAdvanced: shouldAdvance
      });

    } catch (error) {
      console.error('Error generating AI response:', error);
      // Notify clients about the error
      messageEvents.emit('message', {
        type: 'error',
        conversationId,
        error: error.message || 'Failed to generate response'
      });
    }
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