
import { Router } from 'express';
import { storage } from '../storage';
import { patronus } from '../lib/patronus';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const evaluators = await patronus.getAvailableEvaluators();
    
    if (!evaluators) {
      return res.status(500).json({ error: "Failed to fetch evaluators from Patronus" });
    }
    
    res.status(200).json(evaluators);
  } catch (error) {
    console.error("Error fetching evaluators:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const evaluator = await storage.getEvaluator(Number(req.params.id));
    if (!evaluator) {
      return res.status(404).json({ message: 'Evaluator not found' });
    }
    res.json(evaluator);
  } catch (error) {
    console.error('Error fetching evaluator:', error);
    res.status(500).json({ message: 'Failed to fetch evaluator' });
  }
});

router.post('/assign', async (req, res) => {
  try {
    const { conversationId, evaluatorIds } = req.body;
    
    // Remove existing evaluators for this conversation
    await storage.removeConversationEvaluators(conversationId);
    
    // Add new evaluators
    const assignments = await Promise.all(
      evaluatorIds.map(evaluatorId => 
        storage.assignEvaluatorToConversation({
          conversationId,
          evaluatorId,
          isActive: true
        })
      )
    );
    
    res.json(assignments);
  } catch (error) {
    console.error('Error assigning evaluators:', error);
    res.status(500).json({ message: 'Failed to assign evaluators' });
  }
});

export default router;
