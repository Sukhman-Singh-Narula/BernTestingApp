import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { generateResponse } from "./lib/openai";
import { MessageRole } from "@shared/schema";

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

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

  app.post("/api/conversation", async (req, res) => {
    try {
      const { activityId = 1 } = req.body;
      const conversation = await storage.createConversation({
        activityId,
        currentStep: 0
      });

      // Get initial step and generate first message
      const initialStep = await storage.getStepByActivityAndNumber(activityId, 0);
      if (initialStep) {
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

        // Move to step 1 after initial message
        const updatedConversation = await storage.updateConversationStep(
          conversation.id,
          1
        );

        const messages = await storage.getMessagesByConversation(conversation.id);
        return res.json({ ...updatedConversation, messages });
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