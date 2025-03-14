import { storage } from '../storage';
import { generateResponse } from '../lib/openai';
import { MessageRole } from '@shared/schema';

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

    // Get previous messages for context
    const existingMessages = await storage.getMessagesByConversation(conversationId);
    const previousMessages = existingMessages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join("\n");

    // Generate AI response
    const aiResponse = await generateResponse(
      message,
      step,
      previousMessages
    );

    // Create user message
    await storage.createMessage({
      conversationId,
      stepId: step.id,
      role: "user" as MessageRole,
      content: message
    });

    // Create assistant message
    await storage.createMessage({
      conversationId,
      stepId: step.id,
      role: "assistant" as MessageRole,
      content: aiResponse
    });

    // Update conversation step
    const nextStep = conversation.currentStep + 1;
    const updatedConversation = await storage.updateConversationStep(
      conversationId,
      nextStep
    );

    // Get updated messages
    const updatedMessages = await storage.getMessagesByConversation(conversationId);

    // Get system prompt
    const systemPrompt = await storage.getSystemPromptByActivity(updatedConversation.activityId);

    return {
      message: aiResponse,
      conversation: {
        ...updatedConversation,
        messages: updatedMessages,
        systemPrompt
      }
    };
  }
}

export default new MessageService();
