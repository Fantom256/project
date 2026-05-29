import { Router } from 'express';
import courseRoutes from './course.routes.js';
import authRoutes from './auth.routes.js';
import enrollmentRoutes from './enrollments.routes.js';
import reviewRoutes from './review.routes.js';
import adminRoutes from './admin.routes.js';
import paymentRoutes from './payment.routes.js';
import managerRoutes from './manager.routes.js';
import lessonRoutes from './lesson.routes.js';
import gamificationRoutes from './gamification.routes.js';
import supportRoutes from './support.routes.js';
import messagesRoutes from './messages.routes.js';

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'Server is running' }));

router.use('/courses', courseRoutes);
router.use('/auth', authRoutes);
router.use('/enrollments', enrollmentRoutes);
router.use('/reviews', reviewRoutes);
router.use('/admin', adminRoutes);
router.use('/payments', paymentRoutes);
router.use('/manager', managerRoutes);
router.use('/lessons', lessonRoutes);
router.use('/gamification', gamificationRoutes);
router.use('/support', supportRoutes);
router.use('/messages', messagesRoutes);

export default router;
