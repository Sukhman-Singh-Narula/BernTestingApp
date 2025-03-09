import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { generateResponse } from "./lib/openai";
import { MessageRole } from "@shared/schema";

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  // Add new route to get system prompts for an activity
  app.get("/api/activities/:id/system-prompts", async (req, res) => {
    try {
      const activityId = Number(req.params.id);
      const systemPrompts = await storage.getSystemPromptsByActivity(activityId);
      res.json(systemPrompts);
    } catch (error) {
      console.error("Error fetching system prompts:", error);
      res.status(500).json({ message: "Failed to fetch system prompts" });
    }
  });

  // Add new route to get system prompt for an activity
  app.get("/api/activity/:id/system-prompt", async (req, res) => {
    try {
      const activityId = Number(req.params.id);
      const systemPrompt = await storage.getSystemPromptByActivity(activityId);
      if (!systemPrompt) {
        return res.status(404).json({ message: "System prompt not found" });
      }
      res.json(systemPrompt);
    } catch (error) {
      console.error("Error fetching system prompt:", error);
      res.status(500).json({ message: "Failed to fetch system prompt" });
    }
  });

  // Add new route to get all activities
  app.get("/api/activities", async (req, res) => {
    try {
      const activities = await storage.getAllActivities();
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // Add new route to get steps for an activity
  app.get("/api/activity/:id/steps", async (req, res) => {
    try {
      const activityId = Number(req.params.id);
      const steps = await storage.getStepsByActivity(activityId);
      res.json(steps);
    } catch (error) {
      console.error("Error fetching steps:", error);
      res.status(500).json({ message: "Failed to fetch steps" });
    }
  });

  app.post("/api/conversation", async (req, res) => {
    try {
      const { activityId = 1, shouldGenerateFirstResponse = true, userName } = req.body;

      if (!userName) {
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
        userName
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

  app.get("/api/conversation/:id", async (req, res) => {
    try {
      const conversation = await storage.getConversation(Number(req.params.id));
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const messages = await storage.getMessagesByConversation(conversation.id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error getting conversation:", error);
      res.status(500).json({ message: "Failed to get conversation" });
    }
  });

  app.post("/api/conversation/:id/message", async (req, res) => {
    try {
      const { message } = req.body;
      const conversationId = Number(req.params.id);

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const step = await storage.getStepByActivityAndNumber(
        conversation.activityId,
        conversation.currentStep
      );

      if (!step) {
        return res.status(404).json({ message: "Activity step not found" });
      }

      // Get previous messages for context
      const existingMessages = await storage.getMessagesByConversation(conversationId);
      const previousMessages = existingMessages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join("\n");

      // Generate AI response using the step's script
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

      const nextStep = conversation.currentStep + 1;
      const updatedConversation = await storage.updateConversationStep(
        conversationId,
        nextStep
      );

      const updatedMessages = await storage.getMessagesByConversation(conversationId);

      res.json({
        message: aiResponse,
        conversation: { ...updatedConversation, messages: updatedMessages }
      });
    } catch (error) {
      console.error("Error processing message:", error);
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  return httpServer;
}