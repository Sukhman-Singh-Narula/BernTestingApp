import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { generateResponse } from "./lib/openai";
import { MessageRole, conversations, activities, messages } from "@shared/schema";
import { db } from "./db";
import { count } from "drizzle-orm";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { eq, desc } from 'drizzle-orm';

// Configure multer for file upload
const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express, port: number = 5000) {
  const httpServer = createServer(app);

  // Add route to get example CSV
  app.get("/api/activities/example-csv", (req, res) => {
    const csvHeader = "name,contentType,createdBy,stepNumber,description,objective,suggestedScript,spanishWords,expectedResponses,successResponse\n";
    const exampleRow = "Spanish Basics,conversation,system,1,Introduce yourself,Learn basic greeting,Hola! ¿Cómo estás?,hola|cómo|estás,Hola|Hi|Hello,Great job with the greeting!\n";

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=activity_example.csv');
    res.send(csvHeader + exampleRow);
  });

  // Add route to upload activity CSV
  app.post("/api/activities/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const csvContent = req.file.buffer.toString('utf-8');
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true
      });

      if (records.length === 0) {
        return res.status(400).json({ message: "CSV file is empty" });
      }

      // Get unique activity properties from the first row
      const firstRow = records[0];
      const activity = await storage.createActivity({
        name: firstRow.name,
        contentType: firstRow.contentType,
        totalSteps: records.length,
        createdBy: firstRow.createdBy
      });

      // Create steps for each row
      for (const row of records) {
        await storage.createStep({
          activityId: activity.id,
          stepNumber: parseInt(row.stepNumber),
          description: row.description,
          objective: row.objective,
          suggestedScript: row.suggestedScript,
          spanishWords: row.spanishWords,
          expectedResponses: row.expectedResponses,
          successResponse: row.successResponse
        });
      }

      res.json({ message: "Activity created successfully", activity });
    } catch (error) {
      console.error("Error uploading activity:", error);
      res.status(500).json({ message: "Failed to upload activity" });
    }
  });

  // Add new route to get activities with conversation counts
  app.get("/api/activities/with-counts", async (req, res) => {
    try {
      const activitiesWithCounts = await storage.getAllActivitiesWithConversationCounts();
      res.json(activitiesWithCounts);
    } catch (error) {
      console.error("Error fetching activities with counts:", error);
      res.status(500).json({ message: "Failed to fetch activities with counts" });
    }
  });

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
      const activities = await storage.getAllVisibleActivities();
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
        systemPrompt // Pass the systemPrompt if it exists
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

  app.post("/api/conversation/:id/message", async (req, res) => {
    try {
      const { message } = req.body;
      
      // Enhanced validation for conversation ID
      if (!req.params.id || req.params.id === 'undefined' || req.params.id === 'null') {
        console.error(`Missing or invalid conversation ID format: ${req.params.id}`);
        return res.status(400).json({ message: "Missing or invalid conversation ID format" });
      }
      
      const conversationId = Number(req.params.id);
      
      // Validate conversationId is a valid number
      if (isNaN(conversationId) || conversationId <= 0) {
        console.error(`Invalid conversation ID value: ${req.params.id}`);
        return res.status(400).json({ message: "Invalid conversation ID value" });
      }

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

      // Get the system prompt to include it in the response
      const systemPrompt = await storage.getSystemPromptByActivity(updatedConversation.activityId);

      res.json({
        message: aiResponse,
        conversation: {
          ...updatedConversation,
          messages: updatedMessages,
          systemPrompt // Include the system prompt in the response
        }
      });
    } catch (error) {
      console.error("Error processing message:", error);
      res.status(500).json({ message: "Failed to process message" });
    }
  });

  // Add route to toggle activity hidden status
  app.patch("/api/activities/:id/hidden", async (req, res) => {
    try {
      const activityId = Number(req.params.id);
      const { hidden } = req.body;

      if (typeof hidden !== 'boolean') {
        return res.status(400).json({ message: "Hidden status must be a boolean" });
      }

      const updatedActivity = await storage.updateActivityHidden(activityId, hidden);
      res.json(updatedActivity);
    } catch (error) {
      console.error("Error updating activity hidden status:", error);
      res.status(500).json({ message: "Failed to update activity hidden status" });
    }
  });

  // Add new route to get conversations for a user with pagination
  app.get("/api/conversations/:userName", async (req, res) => {
    try {
      const userName = req.params.userName;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      // First get total count
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(conversations)
        .where(eq(conversations.userName, userName));

      // Then get paginated conversations with activity names
      const userConversations = await db
        .select({
          id: conversations.id,
          activityId: conversations.activityId,
          currentStep: conversations.currentStep,
          userName: conversations.userName,
          systemPromptId: conversations.systemPromptId,
          activityName: activities.name
        })
        .from(conversations)
        .where(eq(conversations.userName, userName))
        .leftJoin(activities, eq(conversations.activityId, activities.id))
        .orderBy(desc(conversations.id))
        .limit(limit)
        .offset(offset);

      // Then fetch the last message for each conversation separately
      const conversationsWithLastMessage = await Promise.all(
        userConversations.map(async (conv) => {
          const lastMessages = await db
            .select({
              content: messages.content
            })
            .from(messages)
            .where(eq(messages.conversationId, conv.id))
            .orderBy(desc(messages.createdAt))
            .limit(1);

          return {
            ...conv,
            lastMessage: lastMessages[0] || null
          };
        })
      );

      res.json({
        conversations: conversationsWithLastMessage,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  return httpServer;
}