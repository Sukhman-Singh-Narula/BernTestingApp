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

    // Use the service to handle the message (now returns immediately)
    const result = await messageService.createMessage(conversationId, message);

    res.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to process message";
    const statusCode = errorMessage === "Conversation not found" || errorMessage === "Activity step not found" ? 404 : 500;
    console.error("Error processing message:", error);
    res.status(statusCode).json({ message: errorMessage });
  }
});

// SSE endpoint for message streams
router.get("/conversation/:id/stream", (req, res) => {
  try {
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

    // Set up SSE connection
    messageService.setupSSEConnection(req, res, conversationId);

    // Note: We don't return a response here as the SSE connection remains open
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Failed to establish SSE connection";
    console.error("Error establishing SSE connection:", error);
    res.status(500).json({ message: errorMessage });
  }
});

export default router;