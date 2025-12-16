import { Router } from 'express';
import db from '../config/db.js';

const router = Router();

/**
 * POST /api/enrollments
 * body: { user_id, course_id }
 */
router.post('/', async (req, res) => {
  const { user_id, course_id } = req.body;

  if (!user_id || !course_id) {
    return res.status(400).json({ error: 'user_id и course_id обязательны' });
  }

  try {
    // проверяем, что user и course существуют
    const u = await db.query('SELECT 1 FROM users WHERE user_id = $1', [user_id]);
    if (u.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });

    const c = await db.query('SELECT 1 FROM courses WHERE course_id = $1 AND is_published = TRUE', [course_id]);
    if (c.rows.length === 0) return res.status(404).json({ error: 'Курс не найден или скрыт' });

    // вставка в enrollments
    const ins = await db.query(
      `INSERT INTO enrollments (user_id, course_id, status)
       VALUES ($1, $2, 'active')
       RETURNING enrollment_id, enrolled_at, status`,
      [user_id, course_id]
    );

    return res.status(201).json({ success: true, ...ins.rows[0] });
  } catch (e) {
    // уникальность (user_id, course_id)
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Вы уже записаны на этот курс' });
    }
    console.error('Ошибка enrollments POST:', e);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * GET /api/enrollments/user/:id
 * Курсы пользователя (для cabinet)
 */
router.get('/user/:id', async (req, res) => {
  const userId = Number(req.params.id);
  if (!userId) return res.status(400).json({ error: 'Некорректный user_id' });

  try {
    const r = await db.query(
      `
      SELECT
        e.enrollment_id,
        e.enrolled_at,
        e.status,
        c.course_id,
        c.title,
        c.price,
        cat.name AS category_name
      FROM enrollments e
      JOIN courses c ON c.course_id = e.course_id
      JOIN categories cat ON cat.category_id = c.category_id
      WHERE e.user_id = $1
      ORDER BY e.enrolled_at DESC
      `,
      [userId]
    );

    res.json(r.rows);
  } catch (e) {
    console.error('Ошибка enrollments GET:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
