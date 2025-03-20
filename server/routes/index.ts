import { Router } from 'express';
import messagesRoutes from './messagesRoutes';
import conversationRoutes from './conversationRoutes';

const router = Router();

// Register routes
router.use(conversationRoutes);
router.use(messagesRoutes);

export { router };