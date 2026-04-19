import { Router } from 'express';
import db from '../config/db.js';
import auth from '../middleware/auth.js';
import {
  getUserGamificationSummary,
  getCourseGamificationSummary
} from '../utils/gamification.js';

const router = Router();

async function hasEnrollment(userId, courseId) {
  const q = await db.query(
    `SELECT 1
     FROM enrollments
     WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId]
  );

  return q.rows.length > 0;
}

router.get('/me', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const summary = await getUserGamificationSummary(userId);
    return res.json(summary);
  } catch (e) {
    console.error('GET /gamification/me error:', e);
    return res.status(500).json({ error: 'Ошибка получения геймификации пользователя' });
  }
});

router.get('/course/:courseId', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const courseId = Number(req.params.courseId);

    if (!courseId) {
      return res.status(400).json({ error: 'Некорректный courseId' });
    }

    const enrolled = await hasEnrollment(userId, courseId);
    if (!enrolled) {
      return res.status(403).json({ error: 'Сначала запишитесь на курс' });
    }

    const summary = await getCourseGamificationSummary(userId, courseId);
    return res.json(summary);
  } catch (e) {
    console.error('GET /gamification/course/:courseId error:', e);
    return res.status(500).json({ error: 'Ошибка получения прогресса курса' });
  }
});

export default router;