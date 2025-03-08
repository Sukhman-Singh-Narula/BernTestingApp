import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { generateResponse } from "./lib/openai";
import { Message } from "@shared/schema";

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
      const { activityId = 1 } = req.body; // Accept activityId from request
      const conversation = await storage.createConversation({
        activityId,
        currentStep: 0, // Start from step 0
        messages: []
      });

      // Get initial step and generate first message
      const initialStep = await storage.getStepByActivityAndNumber(activityId, 0);
      if (initialStep) {
        const aiResponse = await generateResponse(
          "start",
          initialStep,
          ""
        );
        const updatedMessages = [
          JSON.stringify({ role: "assistant", content: aiResponse })
        ];

        await storage.updateConversation(
          conversation.id,
          updatedMessages,
          1 // Move to step 1 after initial message
        );

        return res.json({
          ...conversation,
          messages: updatedMessages
        });
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
      res.json(conversation);
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

      // Format previous messages for context
      const previousMessages = conversation.messages.map(msg => {
        const message = JSON.parse(msg);
        return `${message.role}: ${message.content}`;
      }).join("\n");

      // Generate AI response using the step's script
      const aiResponse = await generateResponse(
        message,
        step,
        previousMessages
      );

      // Create new messages array with proper JSON string format
      const updatedMessages = [
        ...conversation.messages,
        JSON.stringify({ role: "user", content: message }),
        JSON.stringify({ role: "assistant", content: aiResponse })
      ];

      const nextStep = conversation.currentStep + 1;
      const updatedConversation = await storage.updateConversation(
        conversationId,
        updatedMessages,
        nextStep
      );

      res.json({
        message: aiResponse,
        conversation: updatedConversation
      });
    } catch (error) {
      console.error("Error processing message:", error);
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  return httpServer;
}