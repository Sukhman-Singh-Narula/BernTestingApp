import { Router } from 'express';
import { storage } from '../storage';
import { generateResponse } from '../lib/openai';
import { MessageRole } from '@shared/schema';

const router = Router();

// POST /api/conversation
router.post("/conversation", async (req, res) => {
  try {
    // Provide sensible defaults and validate
    const { activityId = 1, shouldGenerateFirstResponse = true, userName, systemPrompt } = req.body;
    
    // Validate activityId
    const parsedActivityId = Number(activityId);
    if (isNaN(parsedActivityId) || parsedActivityId <= 0) {
      console.error(`Invalid activity ID: ${activityId}`);
      return res.status(400).json({ message: "Invalid activity ID" });
    }

    if (!userName) {
      console.error("Missing required userName");
      return res.status(400).json({ message: "userName is required" });
    }

    // Try to use step 0 first, fallback to 1 if step 0 does not exist
    let startingStep = 0;
    const step0 = await storage.getStepByActivityAndNumber(activityId, 0);
    if (!step0) {
      startingStep = 1;
    }

    const conversation = await storage.createConversation({
      activityId,
      currentStep: startingStep,
      userName,
      systemPrompt
    });

    // Get the initial step based on the startingStep determined above
    const initialStep = await storage.getStepByActivityAndNumber(activityId, startingStep);
    if (initialStep && shouldGenerateFirstResponse) {
      const aiResponse = await generateResponse(
        "start",
        initialStep,
        ""
      );

      // Create initial assistant message
      await storage.createMessage({
        conversationId: conversation.id,
        stepId: initialStep.id,
        role: "assistant" as MessageRole,
        content: aiResponse
      });

      const messages = await storage.getMessagesByConversation(conversation.id);
      return res.json({ ...conversation, messages });
    }

    res.json(conversation);
  } catch (error) {
    console.error("Error creating conversation:", error);
    res.status(500).json({ message: "Failed to create conversation" });
  }
});

// GET /api/conversation/:id
router.get("/conversation/:id", async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    
    // Validate conversationId
    if (isNaN(conversationId)) {
      console.error(`Invalid conversation ID: ${req.params.id}`);
      return res.status(400).json({ message: "Invalid conversation ID" });
    }
    
    console.log(`Retrieving conversation ${conversationId}`);

    const conversationWithPrompt = await storage.getConversationWithSystemPrompt(conversationId);
    if (!conversationWithPrompt) {
      console.error(`Conversation ${conversationId} not found`);
      return res.status(404).json({ message: "Conversation not found" });
    }

    const messages = await storage.getMessagesByConversation(conversationId);
    console.log(`Found ${messages.length} messages for conversation ${conversationId}`);

    // If no messages but we have a valid conversation, try to generate first response
    if (messages.length === 0) {
      console.log(`No messages found for conversation ${conversationId}, generating initial message`);

      const initialStep = await storage.getStepByActivityAndNumber(
        conversationWithPrompt.activityId,
        conversationWithPrompt.currentStep
      );

      if (initialStep) {
        console.log(`Using step ${initialStep.id} (number ${initialStep.stepNumber}) to generate initial message`);
        const aiResponse = await generateResponse(
          "start",
          initialStep,
          ""
        );

        // Create initial assistant message
        await storage.createMessage({
          conversationId,
          stepId: initialStep.id,
          role: "assistant" as MessageRole,
          content: aiResponse
        });

        // Fetch messages again after creating the initial message
        const updatedMessages = await storage.getMessagesByConversation(conversationId);
        return res.json({ ...conversationWithPrompt, messages: updatedMessages });
      }
    }

    res.json({ ...conversationWithPrompt, messages });
  } catch (error) {
    console.error("Error getting conversation:", error);
    res.status(500).json({ message: "Failed to get conversation" });
  }
});

export default router;
