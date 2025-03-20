import { Router } from 'express';
import messagesRoutes from './messagesRoutes';
import conversationRoutes from './conversationRoutes';
import evaluatorRoutes from './evaluatorRoutes';

const router = Router();

// Register routes
router.use(conversationRoutes);
router.use(messagesRoutes);
router.use('/api/evaluators', evaluatorRoutes);

export { router };