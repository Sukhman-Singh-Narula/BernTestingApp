import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { conversations, activities, messages } from "@shared/schema";
import { db } from "./db";
import { count } from "drizzle-orm";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { eq, desc } from 'drizzle-orm';
import { router as apiRoutes } from './routes/index';
import { patronus } from './lib/patronus';


// Configure multer for file upload
const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express, port: number = 5000) {
  const httpServer = createServer(app);

  // Register modular routes first
  app.use('/api', apiRoutes);

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

  app.get("/api/activities/with-counts", async (req, res) => {
    try {
      const activitiesWithCounts = await storage.getAllActivitiesWithConversationCounts();
      res.json(activitiesWithCounts);
    } catch (error) {
      console.error("Error fetching activities with counts:", error);
      res.status(500).json({ message: "Failed to fetch activities with counts" });
    }
  });



  app.get("/api/activities", async (req, res) => {
    try {
      const activities = await storage.getAllVisibleActivities();
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  app.get("/api/activities/:id", async (req, res) => {
    try {
      const activityId = Number(req.params.id);
      const activity = await storage.getActivity(activityId);
      
      if (!activity) {
        return res.status(404).json({ message: "Activity not found" });
      }
      
      res.json(activity);
    } catch (error) {
      console.error("Error fetching activity:", error);
      res.status(500).json({ message: "Failed to fetch activity" });
    }
  });

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

  app.get("/api/conversations/:userName", async (req, res) => {
    try {
      const userName = req.params.userName;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      const [{ value: total }] = await db
        .select({ value: count() })
        .from(conversations)
        .where(eq(conversations.userName, userName));

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

  app.get("/api/evaluators", async (req, res) => {
    try {
      const evaluators = await storage.getAllEvaluators();
      res.json(evaluators);
    } catch (error) {
      console.error("Error fetching evaluators:", error);
      res.status(500).json({ message: "Failed to fetch evaluators" });
    }
  });

  app.post("/api/evaluators/sync", async (req, res) => {
    try {
      const results = await patronus.syncEvaluators();
      res.json({ message: "Evaluators synced successfully", results });
    } catch (error) {
      console.error("Error syncing evaluators:", error);
      res.status(500).json({ message: "Failed to sync evaluators" });
    }
  });
  
  // Add endpoints for choice layer prompts
  app.get("/api/choice-layer-prompts", async (req, res) => {
    try {
      const choiceLayerPrompts = await storage.getAllChoiceLayerPrompts();
      res.json(choiceLayerPrompts);
    } catch (error) {
      console.error("Error fetching choice layer prompts:", error);
      res.status(500).json({ message: "Failed to fetch choice layer prompts" });
    }
  });
  
  app.post("/api/choice-layer-prompts", async (req, res) => {
    try {
      const { systemPrompt, createdBy } = req.body;
      
      if (!systemPrompt || !createdBy) {
        return res.status(400).json({ message: "System prompt and creator are required" });
      }
      
      const prompt = await storage.createChoiceLayerPrompt({
        systemPrompt,
        createdBy
      });
      
      res.json({ id: prompt.id, message: "Choice layer prompt created successfully" });
    } catch (error) {
      console.error("Error creating choice layer prompt:", error);
      res.status(500).json({ message: "Failed to create choice layer prompt" });
    }
  });

  return httpServer;
}