import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { generateResponse } from "./lib/openai";
import { Message } from "@shared/schema";

export async function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  app.post("/api/conversation", async (req, res) => {
    try {
      const conversation = await storage.createConversation();
      res.json(conversation);
    } catch (error) {
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

      const script = await storage.getScriptByStep(conversation.currentStep);
      if (!script) {
        return res.status(404).json({ message: "Activity script not found" });
      }

      const previousMessages = conversation.messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join("\n");

      const aiResponse = await generateResponse(message, script, previousMessages);
      
      const updatedMessages: Message[] = [
        ...conversation.messages,
        { role: "user", content: message },
        { role: "assistant", content: aiResponse }
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
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  return httpServer;
}
