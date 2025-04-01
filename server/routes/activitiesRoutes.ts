import { Router } from 'express';
import messageService from '../services/messageService';

const router = Router();

// GET /api/activities/info
router.get("/info", async (req, res) => {
  try {
    const activitiesInfo = await messageService.getAvailableActivitiesInfo();
    res.json(activitiesInfo);
  } catch (error) {
    console.error("Error fetching activities info:", error);
    res.status(500).json({ message: "Failed to fetch activities info" });
  }
});

export default router;