import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// Create a system prompt
router.post("/", async (req, res) => {
  try {
    const { activityId, systemPrompt, createdBy, isChoiceLayer } = req.body;

    if (isChoiceLayer) {
      const prompt = await storage.createChoiceLayerPrompt({
        systemPrompt,
        createdBy
      });
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json({ 
        id: prompt.id, 
        message: "Choice layer prompt created successfully" 
      });
      return;
    }

    if (!activityId || !systemPrompt || !createdBy) {
      return res.status(400).json({ 
        message: "Activity ID, system prompt, and creator are required" 
      });
    }

    // Check if activity exists
    const activity = await storage.getActivity(Number(activityId));
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    // Create the system prompt
    const prompt = await storage.createActivitySystemPrompt({
      activityId: Number(activityId),
      systemPrompt,
      createdBy
    });

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ 
      id: prompt.id, 
      message: "System prompt created successfully" 
    });
  } catch (error) {
    console.error("Error creating system prompt:", error);
    res.status(500).json({ message: "Failed to create system prompt" });
  }
});

// Get system prompts by activity ID
router.get("/activity/:id", async (req, res) => {
  try {
    const activityId = Number(req.params.id);
    const systemPrompts = await storage.getActivitySystemPromptsByActivity(activityId);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(systemPrompts);
  } catch (error) {
    console.error("Error fetching system prompts:", error);
    res.status(500).json({ message: "Failed to fetch system prompts" });
  }
});

// Get single system prompt by activity ID
router.get("/activity/:id/latest", async (req, res) => {
  try {
    const activityId = Number(req.params.id);
    const systemPrompt = await storage.getActivitySystemPromptByActivity(activityId);
    if (!systemPrompt) {
      return res.status(404).json({ message: "System prompt not found" });
    }
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(systemPrompt);
  } catch (error) {
    console.error("Error fetching system prompt:", error);
    res.status(500).json({ message: "Failed to fetch system prompt" });
  }
});

export default router;