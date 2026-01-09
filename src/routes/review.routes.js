import { Router } from 'express';
import db from '../config/db.js';

const router = Router();

/* Получить все отзывы (доступно всем) */
router.get('/', async (req, res) => {
  try {
    const q = `
      SELECT
        r.review_id,
        r.rating,
        r.comment,
        r.created_at,
        u.full_name,
        c.title AS course_title,
        r.user_id,
        r.course_id
      FROM reviews r
      JOIN users u   ON u.user_id = r.user_id
      JOIN courses c ON c.course_id = r.course_id
      ORDER BY r.created_at DESC
    `;
    const result = await db.query(q);
    res.json(result.rows);
  } catch (e) {
    console.error('reviews GET error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* Добавить отзыв (ТОЛЬКО авторизованный) */
router.post('/', async (req, res) => {
  try {
    // ВАЖНО: проверяем авторизацию по localStorage (временно) через заголовок x-user-id
    // Позже можно заменить на JWT middleware.
    const userId = Number(req.headers['x-user-id']);
    if (!userId) return res.status(401).json({ error: 'Нужно войти в аккаунт' });

    const { course_id, rating, comment } = req.body;

    if (!course_id || !rating) {
      return res.status(400).json({ error: 'course_id и rating обязательны' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating должен быть от 1 до 5' });
    }

    // проверяем курс
    const c = await db.query('SELECT 1 FROM courses WHERE course_id=$1', [course_id]);
    if (c.rows.length === 0) return res.status(404).json({ error: 'Курс не найден' });

    // вставка (если уже есть — обновим)
    const q = `
      INSERT INTO reviews (user_id, course_id, rating, comment)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, course_id)
      DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = NOW()
      RETURNING review_id
    `;
    const r = await db.query(q, [userId, course_id, rating, comment || null]);

    res.status(201).json({ success: true, review_id: r.rows[0].review_id });
  } catch (e) {
    console.error('reviews POST error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
