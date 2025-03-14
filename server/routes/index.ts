import { Router } from 'express';
import messagesRoutes from './messagesRoutes';

const router = Router();

router.use(messagesRoutes);

export { router };