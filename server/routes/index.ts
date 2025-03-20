import { Router } from 'express';
import messagesRoutes from './messagesRoutes';
import conversationRoutes from './conversationRoutes';
import { router as evaluatorsRoutes } from './evaluators'; // Fixed import

const router = Router();

// Register routes
router.use(conversationRoutes);
router.use(messagesRoutes);
router.use('/evaluators', evaluatorsRoutes); // Added evaluators route

export { router };