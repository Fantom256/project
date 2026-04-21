import { Router } from 'express';
import db from '../config/db.js';
import auth from '../middleware/auth.js';

const router = Router();

// Публичный список отзывов
router.get('/', async (req, res) => {
  try {
    const q = await db.query(
      `SELECT
         r.review_id,
         r.rating,
         r.comment,
         r.created_at,
         u.full_name,
         c.title AS course_title
       FROM reviews r
       JOIN users u ON u.user_id = r.user_id
       JOIN courses c ON c.course_id = r.course_id
       ORDER BY r.created_at DESC`
    );

    res.json(q.rows);
  } catch (e) {
    console.error('GET /reviews error:', e);
    res.status(500).json({ error: 'Ошибка получения отзывов' });
  }
});

// Только авторизованный и только записанный на курс
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { course_id, rating, comment } = req.body;

    const courseId = Number(course_id);
    const reviewRating = Number(rating);

    if (!courseId) {
      return res.status(400).json({ error: 'Некорректный course_id' });
    }

    if (!reviewRating || reviewRating < 1 || reviewRating > 5) {
      return res.status(400).json({ error: 'Оценка должна быть от 1 до 5' });
    }

    // Проверка: пользователь записан на курс
    const enrollmentQ = await db.query(
      `SELECT enrollment_id, payment_status, status
       FROM enrollments
       WHERE user_id = $1
         AND course_id = $2
       LIMIT 1`,
      [userId, courseId]
    );

    if (!enrollmentQ.rows.length) {
      return res.status(403).json({
        error: 'Оставить отзыв можно только после записи на курс'
      });
    }

    // Если хочешь разрешать отзыв только после оплаты — оставь эту проверку
    if (enrollmentQ.rows[0].payment_status !== 'paid') {
      return res.status(403).json({
        error: 'Оставить отзыв можно только после оплаты курса'
      });
    }

    // Если хочешь только один отзыв на курс от одного пользователя
    const existsQ = await db.query(
      `SELECT review_id
       FROM reviews
       WHERE user_id = $1 AND course_id = $2
       LIMIT 1`,
      [userId, courseId]
    );

    if (existsQ.rows.length) {
      return res.status(400).json({
        error: 'Вы уже оставляли отзыв на этот курс'
      });
    }

    const insertQ = await db.query(
      `INSERT INTO reviews (user_id, course_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       RETURNING review_id, user_id, course_id, rating, comment, created_at`,
      [userId, courseId, reviewRating, comment?.trim() || null]
    );

    res.status(201).json({
      success: true,
      review: insertQ.rows[0]
    });
  } catch (e) {
    console.error('POST /reviews error:', e);
    res.status(500).json({ error: 'Ошибка создания отзыва' });
  }
});

export default router;