import { Router } from 'express';
import { storage } from '../storage';
import { generateResponse } from '../lib/openai';
import { MessageRole } from '@shared/schema';

const router = Router();

// POST /api/conversation
router.post("/conversation", async (req, res) => {
  try {
    console.log("Creating conversation with request body:", req.body);

    // Provide sensible defaults and validate
    const { 
      activityId = 3, // Default to Activity Selection
      shouldGenerateFirstResponse = true, 
      userName, 
      systemPrompt,
      choiceLayerPromptId
    } = req.body;

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

    // Verify the activity exists
    const activity = await storage.getActivity(parsedActivityId);
    if (!activity) {
      console.error(`Activity ${parsedActivityId} not found`);
      return res.status(404).json({ message: `Activity ${parsedActivityId} not found` });
    }

    // Try to use step 0 first, fallback to 1 if step 0 does not exist
    let startingStep = 0;
    const step0 = await storage.getStepByActivityAndNumber(parsedActivityId, 0);
    if (!step0) {
      console.log(`No step 0 found for activity ${parsedActivityId}, using step 1 instead`);
      startingStep = 1;
    }

    // Get the selected step to verify it exists
    const initialStep = await storage.getStepByActivityAndNumber(parsedActivityId, startingStep);
    if (!initialStep) {
      console.error(`No step ${startingStep} found for activity ${parsedActivityId}`);
      return res.status(404).json({ message: `Required step ${startingStep} for activity ${parsedActivityId} not found` });
    }

    // Check if there's a system prompt for this activity
    const existingSystemPrompt = await storage.getActivitySystemPromptByActivity(parsedActivityId);

    // Create a default system prompt if none exists and none provided
    if (!existingSystemPrompt && !systemPrompt) {
      console.log(`No system prompt for activity ${parsedActivityId}. Creating default.`);
      const defaultPrompt = `You are an AI language tutor teaching ${activity.language || "Spanish"} to children. 
The current activity is ${activity.name}. 
Be engaging, friendly, and encouraging.
Give simple, clear instructions and provide positive feedback.

Current step objective: ${initialStep.objective}
Expected responses: ${initialStep.expectedResponses}
Spanish words to practice: ${initialStep.spanishWords}`;

      await storage.createActivitySystemPrompt({
        systemPrompt: defaultPrompt,
        activityId: parsedActivityId,
        createdBy: userName || "system"
      });

      console.log(`Created default system prompt for activity ${parsedActivityId}`);
    }

    // Determine how to handle the prompts
    let conversationParams: any = {
      activityId: parsedActivityId,
      currentStep: startingStep,
      userName
    };

    // If systemPrompt is provided, use it
    if (systemPrompt) {
      conversationParams.systemPrompt = systemPrompt;
    }

    // Handle choice layer prompt
    if (choiceLayerPromptId) {
      console.log(`Using existing choiceLayerPromptId: ${choiceLayerPromptId}`);
      conversationParams.choiceLayerPromptId = choiceLayerPromptId;
    } else if (systemPrompt && parsedActivityId === 3) { // Activity Selection uses the input as choice layer
      console.log("Using systemPrompt as choiceLayerPrompt for Activity Selection");
      conversationParams.choiceLayerPrompt = systemPrompt;
    } else {
      // Check if there's at least one choice layer prompt
      const latestChoicePrompt = await storage.getLatestChoiceLayerPrompt();
      if (!latestChoicePrompt) {
        // Create a default choice layer prompt
        console.log("No choice layer prompt found, creating default");
        const defaultChoicePrompt = await storage.createChoiceLayerPrompt({
          systemPrompt: "You are an AI language tutor helping children learn languages. You can switch between different activities based on the user's needs and requests.",
          createdBy: userName || "system"
        });
        console.log(`Created default choice layer prompt with ID: ${defaultChoicePrompt.id}`);
      }
    }

    console.log("Creating conversation with params:", conversationParams);
    const conversation = await storage.createConversation(conversationParams);
    console.log(`Created conversation with ID: ${conversation.id}`);

    // Generate first response if requested
    if (shouldGenerateFirstResponse && initialStep) {
      try {
        console.log(`Generating initial response for conversation ${conversation.id}`);
        const conversationWithPrompt = await storage.getConversationWithSystemPrompt(conversation.id);
        const activitySystemPromptText = conversationWithPrompt?.activitySystemPrompt?.systemPrompt || "";
        const choiceLayerPromptText = conversationWithPrompt?.choiceLayerPrompt?.systemPrompt || "";
        const availableActivities = await storage.getAllActivities(); // Fetch all activities

        const aiResponse = await generateResponse({
          userInput: "start",
          step: initialStep,
          previousMessages: [],
          choiceLayerPrompt: choiceLayerPromptText,
          activitySystemPrompt: activitySystemPromptText,
          conversationId: conversation.id,
          availableActivities: availableActivities // Pass available activities to the model
        });

        // Create initial assistant message
        await storage.createMessage({
          conversationId: conversation.id,
          stepId: initialStep.id,
          role: "assistant" as MessageRole,
          content: aiResponse.content
        });

        const messages = await storage.getMessagesByConversation(conversation.id);
        return res.json({ ...conversation, messages });
      } catch (error) {
        console.error("Error generating initial response:", error);
        // Still return the conversation even if we couldn't generate an initial response
        return res.json({ 
          ...conversation, 
          warning: "Created conversation but failed to generate initial response"
        });
      }
    }

    res.json(conversation);
  } catch (error) {
    console.error("Error creating conversation:", error);
    // Return more detailed error message for debugging
    res.status(500).json({ 
      message: "Failed to create conversation", 
      details: error instanceof Error ? error.message : String(error)
    });
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

    // Get conversation with its associated system prompt
    const conversationWithPrompt = await storage.getConversationWithSystemPrompt(conversationId);
    if (!conversationWithPrompt) {
      console.error(`Conversation ${conversationId} not found`);
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if the activity exists
    const activity = await storage.getActivity(conversationWithPrompt.activityId);
    if (!activity) {
      console.error(`Activity ${conversationWithPrompt.activityId} for conversation ${conversationId} not found`);
      return res.status(404).json({ 
        message: `Activity ${conversationWithPrompt.activityId} for conversation ${conversationId} not found` 
      });
    }

    // Get the initial step - needed if we need to generate a first message
    const initialStep = await storage.getStepByActivityAndNumber(
      conversationWithPrompt.activityId,
      conversationWithPrompt.currentStep
    );

    if (!initialStep) {
      console.error(`Step ${conversationWithPrompt.currentStep} for activity ${conversationWithPrompt.activityId} not found`);
      // Don't return an error, just log it and continue - we'll still return the conversation
    }

    // Verify system prompt exists for this activity
    const systemPrompt = await storage.getActivitySystemPromptByActivity(conversationWithPrompt.activityId);
    if (!systemPrompt && initialStep) {
      console.log(`No system prompt found for activity ${conversationWithPrompt.activityId}. Creating default.`);
      const defaultPrompt = `You are an AI language tutor teaching ${activity.language || "Spanish"} to children. 
The current activity is ${activity.name}. 
Be engaging, friendly, and encouraging.
Give simple, clear instructions and provide positive feedback.

Current step objective: ${initialStep.objective}
Expected responses: ${initialStep.expectedResponses}
Spanish words to practice: ${initialStep.spanishWords}`;

      await storage.createActivitySystemPrompt({
        systemPrompt: defaultPrompt,
        activityId: conversationWithPrompt.activityId,
        createdBy: conversationWithPrompt.userName || "system"
      });

      console.log(`Created default system prompt for activity ${conversationWithPrompt.activityId}`);
    }

    // Get messages for this conversation
    const messages = await storage.getMessagesByConversation(conversationId);
    console.log(`Found ${messages.length} messages for conversation ${conversationId}`);

    // If no messages but we have a valid conversation, try to generate first response
    if (messages.length === 0 && initialStep) {
      try {
        console.log(`No messages found for conversation ${conversationId}, generating initial message`);
        console.log(`Using step ${initialStep.id} (number ${initialStep.stepNumber}) to generate initial message`);
        const conversationWithPrompt = await storage.getConversationWithSystemPrompt(conversationId);
        const activitySystemPromptText = conversationWithPrompt?.activitySystemPrompt?.systemPrompt || "";
        const choiceLayerPromptText = conversationWithPrompt?.choiceLayerPrompt?.systemPrompt || "";
        const availableActivities = await storage.getAllActivities(); //Fetch all activities

        const aiResponse = await generateResponse({
          userInput: "start",
          step: initialStep,
          previousMessages: [],
          choiceLayerPrompt: choiceLayerPromptText,
          activitySystemPrompt: activitySystemPromptText,
          conversationId: conversationId,
          storage: storage
        });

        // Create initial assistant message
        await storage.createMessage({
          conversationId,
          stepId: initialStep.id,
          role: "assistant" as MessageRole,
          content: aiResponse.content
        });

        // Fetch messages again after creating the initial message
        const updatedMessages = await storage.getMessagesByConversation(conversationId);
        return res.json({ ...conversationWithPrompt, messages: updatedMessages });
      } catch (error) {
        console.error(`Error generating initial message for conversation ${conversationId}:`, error);
        // Return the conversation even if we couldn't generate an initial message
        return res.json({ 
          ...conversationWithPrompt, 
          messages,
          warning: "Returned conversation but could not generate initial message" 
        });
      }
    }

    res.json({ ...conversationWithPrompt, messages });
  } catch (error) {
    console.error("Error getting conversation:", error);
    res.status(500).json({ 
      message: "Failed to get conversation", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;