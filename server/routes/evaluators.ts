
import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const evaluators = await storage.getAllEvaluators();
    res.json(evaluators);
  } catch (error) {
    console.error('Error fetching evaluators:', error);
    res.status(500).json({ message: 'Failed to fetch evaluators' });
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

export default router;
