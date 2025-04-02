import { Router } from 'express';
import messagesRoutes from './messagesRoutes';
import conversationRoutes from './conversationRoutes';
import activitiesRoutes from './activitiesRoutes';
import systemPromptRoutes from './systemPromptRoutes';
import { router as evaluatorsRoutes } from './evaluators';

const router = Router();

// Register routes
router.use(conversationRoutes);
router.use(messagesRoutes);
router.use('/activities', activitiesRoutes);
router.use('/evaluators', evaluatorsRoutes);
router.use('/system-prompts', systemPromptRoutes);

export { router };