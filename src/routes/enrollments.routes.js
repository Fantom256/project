import { Router } from 'express';
import db from '../config/db.js';
import auth from '../middleware/auth.js';

const router = Router();

// POST /api/enrollments  { course_id }
router.post('/', auth, async (req, res) => {
  const user_id = req.user.user_id;
  const { course_id } = req.body;

  if (!course_id) return res.status(400).json({ error: 'course_id обязателен' });

  try {
    // курс существует?
    const c = await db.query('SELECT 1 FROM courses WHERE course_id=$1 AND is_published=true', [course_id]);
    if (!c.rows.length) return res.status(404).json({ error: 'Курс не найден' });

    const ins = await db.query(
      `INSERT INTO enrollments (user_id, course_id)
       VALUES ($1,$2)
       ON CONFLICT (user_id, course_id) DO NOTHING
       RETURNING enrollment_id`,
      [user_id, course_id]
    );

    if (!ins.rows.length) {
      return res.status(409).json({ error: 'Вы уже записаны на этот курс' });
    }

    res.status(201).json({ success: true, enrollment_id: ins.rows[0].enrollment_id });
  } catch (e) {
    console.error('enroll error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/enrollments/me
router.get('/me', auth, async (req, res) => {
  const user_id = req.user.user_id;
  try {
    const r = await db.query(
      `SELECT e.enrolled_at, e.status,
              c.course_id, c.title, c.price, c.duration_months,
              cat.name AS category_name
       FROM enrollments e
       JOIN courses c ON c.course_id = e.course_id
       JOIN categories cat ON cat.category_id = c.category_id
       WHERE e.user_id = $1
       ORDER BY e.enrolled_at DESC`,
      [user_id]
    );

    res.json(r.rows);
  } catch (e) {
    console.error('enrollments/me error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
