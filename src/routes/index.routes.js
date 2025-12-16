import { Router } from 'express';
import courseRoutes from './course.routes.js';
import enrollmentsRoutes from './enrollments.routes.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

router.use('/courses', courseRoutes);
router.use('/enrollments', enrollmentsRoutes);

export default router;
