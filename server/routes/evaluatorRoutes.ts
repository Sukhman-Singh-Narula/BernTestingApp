import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// GET /api/evaluators
router.get("/", async (req, res) => {
  try {
    console.log("Fetching evaluators from database...");
    const evaluators = await storage.getAllEvaluators();
    console.log("Found evaluators:", evaluators);

    if (!evaluators || evaluators.length === 0) {
      console.log("No evaluators found in database");
    }

    res.setHeader('Content-Type', 'application/json');
    res.json(evaluators);
  } catch (error) {
    console.error("Error fetching evaluators:", error);
    res.status(500).json({ 
      message: "Failed to fetch evaluators",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;