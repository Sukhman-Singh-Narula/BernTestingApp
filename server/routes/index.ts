import { Router } from 'express';
import messagesRoutes from './messagesRoutes';
import conversationRoutes from './conversationRoutes';
import evaluatorsRoutes from './evaluatorsRoutes'; // Added import

const router = Router();

// Register routes
router.use(conversationRoutes);
router.use(messagesRoutes);
router.use('/evaluators', evaluatorsRoutes); // Added evaluators route

export { router };