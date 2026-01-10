import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';

const router = Router();

/** Проверка админа: сначала пробуем JWT, иначе x-role (как у тебя в админке) */
function requireAdmin(req, res, next) {
  // 1) JWT
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
      if (payload?.role === 'admin') return next();
      return res.status(403).json({ error: 'Доступ только для администратора' });
    } catch {
      return res.status(401).json({ error: 'Неверный токен' });
    }
  }

  // 2) fallback: x-role (небезопасно, но подходит для учебного проекта)
  if (req.headers['x-role'] !== 'admin') {
    return res.status(403).json({ error: 'Доступ только для администратора' });
  }
  next();
}

router.use(requireAdmin);

/* ===== CATEGORIES (для селекта в модалке курсов) ===== */
router.get('/categories', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT category_id, name
       FROM categories
       ORDER BY name`
    );
    res.json(r.rows);
  } catch (e) {
    console.error('admin categories error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

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

router.delete('/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Некорректный id' });

    // не даём удалить админа (можно убрать, если захочешь)
    const roleCheck = await db.query(
      `SELECT r.name AS role
       FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1`,
      [id]
    );
    if (roleCheck.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    if (roleCheck.rows[0].role === 'admin') {
      return res.status(400).json({ error: 'Нельзя удалять администратора' });
    }

    const del = await db.query('DELETE FROM users WHERE user_id = $1 RETURNING user_id', [id]);
    res.json({ success: true, user_id: del.rows[0].user_id });
  } catch (e) {
    console.error('admin delete user error:', e);
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
        c.description,
        c.price,
        c.duration_months,
        c.image_url,
        c.category_id,
        cat.name AS category_name,
        c.is_published,
        c.created_at
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

router.post('/courses', async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      duration_months = 3,
      image_url = null,
      category_id,
      is_published = true
    } = req.body;

    if (!title || !description || price == null || !category_id) {
      return res.status(400).json({ error: 'title, description, price, category_id обязательны' });
    }

    const ins = await db.query(
      `INSERT INTO courses
        (title, description, price, duration_months, image_url, category_id, is_published)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING course_id`,
      [title, description, price, duration_months, image_url, category_id, is_published]
    );

    res.status(201).json({ success: true, course_id: ins.rows[0].course_id });
  } catch (e) {
    console.error('admin create course error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.patch('/courses/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Некорректный id' });

    const {
      title,
      description,
      price,
      duration_months,
      image_url,
      category_id,
      is_published
    } = req.body;

    // простая валидация (частичная правка)
    const upd = await db.query(
      `UPDATE courses SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        price = COALESCE($4, price),
        duration_months = COALESCE($5, duration_months),
        image_url = COALESCE($6, image_url),
        category_id = COALESCE($7, category_id),
        is_published = COALESCE($8, is_published)
       WHERE course_id = $1
       RETURNING course_id`,
      [id, title ?? null, description ?? null, price ?? null, duration_months ?? null, image_url ?? null, category_id ?? null, is_published ?? null]
    );

    if (!upd.rows.length) return res.status(404).json({ error: 'Курс не найден' });
    res.json({ success: true, course_id: upd.rows[0].course_id });
  } catch (e) {
    console.error('admin update course error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.delete('/courses/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Некорректный id' });

    const del = await db.query('DELETE FROM courses WHERE course_id = $1 RETURNING course_id', [id]);
    if (!del.rows.length) return res.status(404).json({ error: 'Курс не найден' });

    res.json({ success: true, course_id: del.rows[0].course_id });
  } catch (e) {
    // если где-то нет ON DELETE CASCADE, возможна ошибка FK
    console.error('admin delete course error:', e);
    res.status(500).json({ error: 'Ошибка сервера (возможно курс связан с данными)' });
  }
});

/* ===== ENROLLMENTS (оставляю твоё) ===== */
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
    if (!allowed.has(status)) return res.status(400).json({ error: 'Недопустимый статус' });

    const r = await db.query(
      `UPDATE enrollments
       SET status = $2
       WHERE enrollment_id = $1
       RETURNING enrollment_id, status`,
      [enrollmentId, status]
    );

    if (!r.rows.length) return res.status(404).json({ error: 'Запись не найдена' });
    res.json({ success: true, ...r.rows[0] });
  } catch (e) {
    console.error('admin enrollments status error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ===== REVIEWS (оставляю твоё) ===== */
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
    if (!r.rows.length) return res.status(404).json({ error: 'Отзыв не найден' });
    res.json({ success: true });
  } catch (e) {
    console.error('admin delete review error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
