import { Router } from 'express';
import db from '../config/db.js';

const router = Router();

/* Простая защита: берём роль из заголовка x-role (пока без JWT middleware) */
function requireAdmin(req, res, next) {
  if (req.headers['x-role'] !== 'admin') {
    return res.status(403).json({ error: 'Доступ только для администратора' });
  }
  next();
}

router.use(requireAdmin);

/* ===== USERS ===== */
router.get('/users', async (req, res) => {
  try {
    const q = `
      SELECT
        u.user_id,
        u.full_name,
        u.email,
        r.name AS role,
        u.created_at
      FROM users u
      JOIN roles r ON r.role_id = u.role_id
      ORDER BY u.user_id DESC
    `;
    const r = await db.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error('admin users error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ===== COURSES ===== */
router.get('/courses', async (req, res) => {
  try {
    const q = `
      SELECT
        c.course_id,
        c.title,
        c.price,
        c.is_published,
        c.created_at,
        cat.name AS category_name
      FROM courses c
      JOIN categories cat ON cat.category_id = c.category_id
      ORDER BY c.course_id
    `;
    const r = await db.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error('admin courses error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ===== ENROLLMENTS ===== */
router.get('/enrollments', async (req, res) => {
  try {
    const q = `
      SELECT
        e.enrollment_id,
        e.status,
        e.enrolled_at,
        u.full_name,
        c.title AS course_title
      FROM enrollments e
      JOIN users u   ON u.user_id = e.user_id
      JOIN courses c ON c.course_id = e.course_id
      ORDER BY e.enrolled_at DESC
    `;
    const r = await db.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error('admin enrollments error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.patch('/enrollments/:id/status', async (req, res) => {
  try {
    const enrollmentId = Number(req.params.id);
    const { status } = req.body;

    const allowed = new Set(['active', 'completed', 'canceled']);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: 'Недопустимый статус' });
    }

    const q = `
      UPDATE enrollments
      SET status = $2
      WHERE enrollment_id = $1
      RETURNING enrollment_id, status
    `;
    const r = await db.query(q, [enrollmentId, status]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Запись не найдена' });

    res.json({ success: true, ...r.rows[0] });
  } catch (e) {
    console.error('admin enrollments status error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ===== REVIEWS ===== */
router.get('/reviews', async (req, res) => {
  try {
    const q = `
      SELECT
        r.review_id,
        r.rating,
        r.comment,
        r.created_at,
        u.full_name,
        c.title AS course_title
      FROM reviews r
      JOIN users u   ON u.user_id = r.user_id
      JOIN courses c ON c.course_id = r.course_id
      ORDER BY r.created_at DESC
    `;
    const r = await db.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error('admin reviews error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/reviews/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await db.query('DELETE FROM reviews WHERE review_id = $1 RETURNING review_id', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Отзыв не найден' });
    res.json({ success: true });
  } catch (e) {
    console.error('admin delete review error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
