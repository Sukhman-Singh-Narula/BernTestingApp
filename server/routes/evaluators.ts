
import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const evaluators = await storage.getAllEvaluators();
    res.json(evaluators);
  } catch (error) {
    console.error('Error fetching evaluators:', error);
    res.status(500).json({ message: 'Failed to fetch evaluators' });
  }
});

router.post('/assign', async (req, res) => {
  try {
    const { conversationId, evaluatorIds } = req.body;
    
    console.log(`[Evaluators Route] Assigning evaluators to conversation ${conversationId}:`, evaluatorIds);
    
    // Remove existing evaluators for this conversation
    await storage.removeConversationEvaluators(conversationId);
    console.log(`[Evaluators Route] Removed existing evaluators for conversation ${conversationId}`);
    
    // Add new evaluators
    const assignments = await Promise.all(
      evaluatorIds.map(evaluatorId => {
        console.log(`[Evaluators Route] Assigning evaluator ${evaluatorId} to conversation ${conversationId}`);
        return storage.assignEvaluatorToConversation({
          conversationId,
          evaluatorId,
          isActive: true
        });
      })
    );
    
    console.log(`[Evaluators Route] Successfully assigned ${assignments.length} evaluators to conversation ${conversationId}`);
    
    res.json(assignments);
  } catch (error) {
    console.error('Error assigning evaluators:', error);
    res.status(500).json({ message: 'Failed to assign evaluators' });
  }
});

export { router };
