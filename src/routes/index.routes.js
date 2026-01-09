import { Router } from 'express';
import courseRoutes from './course.routes.js';
import authRoutes from './auth.routes.js';
import enrollmentRoutes from './enrollments.routes.js';
import reviewRoutes from './review.routes.js';
import adminRoutes from './admin.routes.js';


const router = Router();

router.get('/health', (req, res) => res.json({ status: 'Server is running' }));

router.use('/courses', courseRoutes);
router.use('/auth', authRoutes);
router.use('/enrollments', enrollmentRoutes);
router.use('/reviews', reviewRoutes);
router.use('/admin', adminRoutes);



export default router;

