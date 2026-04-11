import { Router } from 'express';
import db from '../config/db.js';
import auth from '../middleware/auth.js';

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

// Список уроков курса
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

    const q = await db.query(
      `SELECT
         l.lesson_id,
         l.course_id,
         l.title,
         l.lesson_order,
         COALESCE(lp.is_completed, FALSE) AS is_completed,
         lp.completed_at
       FROM lessons l
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id = l.lesson_id
        AND lp.user_id = $2
       WHERE l.course_id = $1
       ORDER BY l.lesson_order`,
      [courseId, userId]
    );

    res.json(q.rows);
  } catch (e) {
    console.error('GET /lessons/course/:courseId error:', e);
    res.status(500).json({ error: 'Ошибка получения уроков' });
  }
});

// Получить один урок
router.get('/:lessonId', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const lessonId = Number(req.params.lessonId);

    if (!lessonId) {
      return res.status(400).json({ error: 'Некорректный lessonId' });
    }

    const lessonQ = await db.query(
      `SELECT
         l.lesson_id,
         l.course_id,
         l.title,
         l.content,
         l.lesson_order,
         COALESCE(lp.is_completed, FALSE) AS is_completed,
         lp.completed_at
       FROM lessons l
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id = l.lesson_id
        AND lp.user_id = $2
       WHERE l.lesson_id = $1`,
      [lessonId, userId]
    );

    if (!lessonQ.rows.length) {
      return res.status(404).json({ error: 'Урок не найден' });
    }

    const lesson = lessonQ.rows[0];

    const enrolled = await hasEnrollment(userId, lesson.course_id);
    if (!enrolled) {
      return res.status(403).json({ error: 'Сначала запишитесь на курс' });
    }

    const prevQ = await db.query(
      `SELECT lesson_id, title
       FROM lessons
       WHERE course_id = $1 AND lesson_order < $2
       ORDER BY lesson_order DESC
       LIMIT 1`,
      [lesson.course_id, lesson.lesson_order]
    );

    const nextQ = await db.query(
      `SELECT lesson_id, title
       FROM lessons
       WHERE course_id = $1 AND lesson_order > $2
       ORDER BY lesson_order ASC
       LIMIT 1`,
      [lesson.course_id, lesson.lesson_order]
    );

    res.json({
      ...lesson,
      previous_lesson: prevQ.rows[0] || null,
      next_lesson: nextQ.rows[0] || null
    });
  } catch (e) {
    console.error('GET /lessons/:lessonId error:', e);
    res.status(500).json({ error: 'Ошибка получения урока' });
  }
});

// Отметить урок как выполненный
router.patch('/:lessonId/complete', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const lessonId = Number(req.params.lessonId);

    if (!lessonId) {
      return res.status(400).json({ error: 'Некорректный lessonId' });
    }

    const lessonQ = await db.query(
      `SELECT lesson_id, course_id
       FROM lessons
       WHERE lesson_id = $1`,
      [lessonId]
    );

    if (!lessonQ.rows.length) {
      return res.status(404).json({ error: 'Урок не найден' });
    }

    const lesson = lessonQ.rows[0];

    const enrolled = await hasEnrollment(userId, lesson.course_id);
    if (!enrolled) {
      return res.status(403).json({ error: 'Сначала запишитесь на курс' });
    }

    const result = await db.query(
      `INSERT INTO lesson_progress (user_id, lesson_id, is_completed, completed_at)
       VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, lesson_id)
       DO UPDATE SET
         is_completed = TRUE,
         completed_at = CURRENT_TIMESTAMP
       RETURNING progress_id, is_completed, completed_at`,
      [userId, lessonId]
    );

    res.json({
      success: true,
      progress: result.rows[0]
    });
  } catch (e) {
    console.error('PATCH /lessons/:lessonId/complete error:', e);
    res.status(500).json({ error: 'Ошибка отметки урока' });
  }
});

// Прогресс по курсу
router.get('/progress/:courseId', auth, async (req, res) => {
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

    const q = await db.query(
      `SELECT
         COUNT(l.lesson_id) AS total_lessons,
         COUNT(lp.lesson_id) FILTER (WHERE lp.is_completed = TRUE) AS completed_lessons
       FROM lessons l
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id = l.lesson_id
        AND lp.user_id = $2
       WHERE l.course_id = $1`,
      [courseId, userId]
    );

    const total = Number(q.rows[0].total_lessons || 0);
    const completed = Number(q.rows[0].completed_lessons || 0);

    res.json({
      course_id: courseId,
      total_lessons: total,
      completed_lessons: completed,
      progress_percent: total > 0 ? Math.round((completed / total) * 100) : 0
    });
  } catch (e) {
    console.error('GET /lessons/progress/:courseId error:', e);
    res.status(500).json({ error: 'Ошибка получения прогресса' });
  }
});

export default router;