import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';

const router = Router();

function requireManager(req, res, next) {
  const auth = req.headers.authorization;

  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);

      if (payload?.role === 'manager') {
        req.user = payload;
        return next();
      }

      return res.status(403).json({ error: 'Доступ только для менеджера' });
    } catch {
      return res.status(401).json({ error: 'Неверный токен' });
    }
  }

  if (req.headers['x-role'] !== 'manager') {
    return res.status(403).json({ error: 'Доступ только для менеджера' });
  }

  next();
}

router.use(requireManager);

/* ===== ENROLLMENTS ===== */
router.get('/enrollments', async (req, res) => {
  try {
    const q = `
      SELECT
        e.enrollment_id,
        e.status,
        e.enrolled_at,
        e.payment_status,
        e.payment_date,
        u.user_id,
        u.full_name,
        u.email,
        c.title AS course_title
      FROM enrollments e
      JOIN users u   ON u.user_id = e.user_id
      JOIN courses c ON c.course_id = e.course_id
      ORDER BY e.enrolled_at DESC
    `;
    const r = await db.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error('manager enrollments error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.patch('/enrollments/:id/status', async (req, res) => {
  try {
    const enrollmentId = Number(req.params.id);
    const { status } = req.body;

    const allowed = new Set(['active', 'completed', 'canceled']);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: 'Недопустимый статус записи' });
    }

    const r = await db.query(
      `UPDATE enrollments
       SET status = $2
       WHERE enrollment_id = $1
       RETURNING enrollment_id, status`,
      [enrollmentId, status]
    );

    if (!r.rows.length) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    res.json({ success: true, ...r.rows[0] });
  } catch (e) {
    console.error('manager enrollment status error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.patch('/enrollments/:id/payment-status', async (req, res) => {
  try {
    const enrollmentId = Number(req.params.id);
    const { payment_status } = req.body;

    const allowed = new Set(['unpaid', 'paid', 'canceled']);
    if (!allowed.has(payment_status)) {
      return res.status(400).json({ error: 'Недопустимый статус оплаты' });
    }

    const paymentDate = payment_status === 'paid' ? 'CURRENT_TIMESTAMP' : 'NULL';

    const q = `
      UPDATE enrollments
      SET payment_status = $2,
          payment_date = ${paymentDate}
      WHERE enrollment_id = $1
      RETURNING enrollment_id, payment_status, payment_date
    `;

    const r = await db.query(q, [enrollmentId, payment_status]);

    if (!r.rows.length) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    res.json({ success: true, ...r.rows[0] });
  } catch (e) {
    console.error('manager payment status error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ===== CONTACTS ===== */
router.get('/contacts', async (req, res) => {
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
    console.error('manager contacts error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;