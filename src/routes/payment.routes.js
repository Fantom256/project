import { Router } from 'express';
import db from '../config/db.js';
import auth from '../middleware/auth.js';

const router = Router();

/**
 * Получить все оплаты текущего пользователя
 */
router.get('/my', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await db.query(
      `SELECT 
          e.enrollment_id,
          e.payment_status,
          e.payment_date,
          c.title AS course_title,
          c.price
       FROM enrollments e
       JOIN courses c ON c.course_id = e.course_id
       WHERE e.user_id = $1
       ORDER BY e.enrolled_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (e) {
    console.error('GET /payments/my error:', e);
    res.status(500).json({ error: 'Ошибка получения оплат' });
  }
});

/**
 * Подтвердить демо-оплату
 */
router.patch('/pay/:enrollmentId', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const enrollmentId = Number(req.params.enrollmentId);

    if (!enrollmentId) {
      return res.status(400).json({ error: 'Некорректный enrollmentId' });
    }

    const check = await db.query(
      `SELECT enrollment_id, payment_status
       FROM enrollments
       WHERE enrollment_id = $1 AND user_id = $2`,
      [enrollmentId, userId]
    );

    if (!check.rows.length) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    if (check.rows[0].payment_status === 'paid') {
      return res.status(400).json({ error: 'Курс уже оплачен' });
    }

    const result = await db.query(
      `UPDATE enrollments
       SET payment_status = 'paid',
           payment_date = CURRENT_TIMESTAMP
       WHERE enrollment_id = $1
       RETURNING enrollment_id, payment_status, payment_date`,
      [enrollmentId]
    );

    res.json({
      success: true,
      payment: result.rows[0]
    });
  } catch (e) {
    console.error('PATCH /payments/pay/:id error:', e);
    res.status(500).json({ error: 'Ошибка подтверждения оплаты' });
  }
});

/**
 * Отмена демо-оплаты
 */
router.patch('/cancel/:enrollmentId', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const enrollmentId = Number(req.params.enrollmentId);

    const result = await db.query(
      `UPDATE enrollments
       SET payment_status = 'canceled'
       WHERE enrollment_id = $1 AND user_id = $2
       RETURNING enrollment_id, payment_status`,
      [enrollmentId, userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    res.json({
      success: true,
      payment: result.rows[0]
    });
  } catch (e) {
    console.error('PATCH /payments/cancel/:id error:', e);
    res.status(500).json({ error: 'Ошибка отмены оплаты' });
  }
});

export default router;