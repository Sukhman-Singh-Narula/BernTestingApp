import { Router } from 'express';
import messageService from '../services/messageService';

const router = Router();

// POST /api/conversation/:id/message
router.post("/conversation/:id/message", async (req, res) => {
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

    // Use the service to handle the message
    const result = await messageService.createMessage(conversationId, message);
    
    res.json(result);
  } catch (error) {
    console.error("Error processing message:", error);
    res.status(error.message === "Conversation not found" || error.message === "Activity step not found" ? 404 : 500)
      .json({ message: error.message || "Failed to process message" });
  }
});

export default router;
