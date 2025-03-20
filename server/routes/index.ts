import { Router } from 'express';
import messagesRoutes from './messagesRoutes';
import conversationRoutes from './conversationRoutes';
import evaluatorRoutes from './evaluatorRoutes';

const router = Router();

// Mount API routes first, before any static file handling
router.use('/api/evaluators', evaluatorRoutes);
router.use(conversationRoutes);
router.use(messagesRoutes);

export { router };