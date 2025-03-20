import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

// GET /api/evaluators
router.get("/", async (req, res) => {
  try {
    const evaluators = await storage.getAllEvaluators();
    res.json(evaluators);
  } catch (error) {
    console.error("Error fetching evaluators:", error);
    res.status(500).json({ message: "Failed to fetch evaluators" });
  }
});

export default router;
