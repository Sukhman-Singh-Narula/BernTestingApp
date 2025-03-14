import { Router } from 'express';
import messagesRoutes from './messagesRoutes';
import conversationRoutes from './conversationRoutes';
import sseRoutes from './sseRoutes';

const router = Router();

// Register routes
router.use(conversationRoutes);
router.use(messagesRoutes);
router.use(sseRoutes);

export { router };