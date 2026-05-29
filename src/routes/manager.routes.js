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

function requireManagerUserId(req, res, next) {
  if (!req.user?.user_id) {
    return res.status(401).json({
      error: 'Для личных сообщений нужен вход по токену'
    });
  }

  next();
}

/* =========================================
   ENROLLMENTS
========================================= */
router.get('/enrollments', async (req, res) => {
  try {
    const q = `
      SELECT
        e.enrollment_id,
        e.course_id,
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
      `
      UPDATE enrollments
      SET status = $2
      WHERE enrollment_id = $1
      RETURNING enrollment_id, status
      `,
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

/* =========================================
   CONTACTS
========================================= */
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

/* =========================================
   CATEGORIES
   ВАЖНО: берём только category_id и name
========================================= */
router.get('/categories', async (req, res) => {
  try {
    const q = `
      SELECT
        category_id,
        name
      FROM categories
      ORDER BY name ASC
    `;
    const r = await db.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error('manager categories error:', e);
    res.status(500).json({
      error: 'Ошибка получения категорий',
      details: e.message
    });
  }
});

/* =========================================
   COURSES
========================================= */
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
        c.is_published,
        c.created_at,
        COALESCE(cat.name, 'Без категории') AS category_name
      FROM courses c
      LEFT JOIN categories cat ON cat.category_id = c.category_id
      ORDER BY c.course_id ASC
    `;
    const r = await db.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error('manager courses list error:', e);
    res.status(500).json({ error: 'Ошибка получения курсов' });
  }
});

router.post('/courses', async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      duration_months,
      image_url,
      category_id,
      is_published
    } = req.body;

    if (!title || !description || price == null || !category_id) {
      return res.status(400).json({ error: 'Не заполнены обязательные поля курса' });
    }

    const q = `
      INSERT INTO courses (
        title,
        description,
        price,
        duration_months,
        image_url,
        category_id,
        is_published
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const r = await db.query(q, [
      title.trim(),
      description.trim(),
      Number(price),
      Number(duration_months || 3),
      image_url || null,
      Number(category_id),
      Boolean(is_published)
    ]);

    res.status(201).json({ success: true, course: r.rows[0] });
  } catch (e) {
    console.error('manager create course error:', e);
    res.status(500).json({ error: 'Ошибка создания курса' });
  }
});

router.patch('/courses/:id', async (req, res) => {
  try {
    const courseId = Number(req.params.id);

    const {
      title,
      description,
      price,
      duration_months,
      image_url,
      category_id,
      is_published
    } = req.body;

    const q = `
      UPDATE courses
      SET
        title = $2,
        description = $3,
        price = $4,
        duration_months = $5,
        image_url = $6,
        category_id = $7,
        is_published = $8
      WHERE course_id = $1
      RETURNING *
    `;

    const r = await db.query(q, [
      courseId,
      title?.trim(),
      description?.trim(),
      Number(price),
      Number(duration_months || 3),
      image_url || null,
      Number(category_id),
      Boolean(is_published)
    ]);

    if (!r.rows.length) {
      return res.status(404).json({ error: 'Курс не найден' });
    }

    res.json({ success: true, course: r.rows[0] });
  } catch (e) {
    console.error('manager update course error:', e);
    res.status(500).json({ error: 'Ошибка обновления курса' });
  }
});

router.delete('/courses/:id', async (req, res) => {
  try {
    const courseId = Number(req.params.id);

    const r = await db.query(
      `DELETE FROM courses WHERE course_id = $1 RETURNING course_id`,
      [courseId]
    );

    if (!r.rows.length) {
      return res.status(404).json({ error: 'Курс не найден' });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('manager delete course error:', e);

    if (e.code === '23503') {
      return res.status(400).json({
        error: 'Нельзя удалить курс: он связан с записями, уроками или другими данными'
      });
    }

    res.status(500).json({ error: 'Ошибка удаления курса' });
  }
});

/* =========================================
   REVIEWS
========================================= */
router.get('/reviews', async (req, res) => {
  try {
    const q = `
      SELECT
        r.review_id,
        r.rating,
        r.comment,
        r.created_at,
        u.user_id,
        u.full_name,
        c.course_id,
        c.title AS course_title
      FROM reviews r
      JOIN users u   ON u.user_id = r.user_id
      JOIN courses c ON c.course_id = r.course_id
      ORDER BY r.review_id DESC
    `;
    const result = await db.query(q);
    res.json(result.rows);
  } catch (e) {
    console.error('manager reviews list error:', e);
    res.status(500).json({ error: 'Ошибка получения отзывов' });
  }
});

router.delete('/reviews/:id', async (req, res) => {
  try {
    const reviewId = Number(req.params.id);

    const r = await db.query(
      `DELETE FROM reviews WHERE review_id = $1 RETURNING review_id`,
      [reviewId]
    );

    if (!r.rows.length) {
      return res.status(404).json({ error: 'Отзыв не найден' });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('manager delete review error:', e);
    res.status(500).json({ error: 'Ошибка удаления отзыва' });
  }
});

/* =========================================
   MANAGER PERSONAL MESSAGES
========================================= */

// создать или получить уже существующий диалог с пользователем
router.post('/messages/threads', requireManagerUserId, async (req, res) => {
  try {
    const managerId = Number(req.user.user_id);
    const studentId = Number(req.body.student_id);

    if (!studentId) {
      return res.status(400).json({ error: 'Не передан student_id' });
    }

    if (managerId === studentId) {
      return res.status(400).json({ error: 'Нельзя создать диалог с самим собой' });
    }

    const userCheck = await db.query(
      `SELECT user_id, full_name, email
       FROM users
       WHERE user_id = $1
       LIMIT 1`,
      [studentId]
    );

    if (!userCheck.rows.length) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const existing = await db.query(
      `SELECT thread_id, manager_id, student_id, created_at, updated_at
       FROM manager_threads
       WHERE manager_id = $1 AND student_id = $2
       LIMIT 1`,
      [managerId, studentId]
    );

    if (existing.rows.length) {
      return res.json({
        success: true,
        thread: existing.rows[0],
        is_new: false
      });
    }

    const created = await db.query(
      `INSERT INTO manager_threads (manager_id, student_id)
       VALUES ($1, $2)
       RETURNING thread_id, manager_id, student_id, created_at, updated_at`,
      [managerId, studentId]
    );

    res.status(201).json({
      success: true,
      thread: created.rows[0],
      is_new: true
    });
  } catch (e) {
    console.error('manager create message thread error:', e);
    res.status(500).json({ error: 'Ошибка создания диалога' });
  }
});

// список диалогов менеджера
router.get('/messages/threads', requireManagerUserId, async (req, res) => {
  try {
    const managerId = Number(req.user.user_id);

    const q = `
      SELECT
        mt.thread_id,
        mt.manager_id,
        mt.student_id,
        mt.created_at,
        mt.updated_at,
        u.full_name,
        u.email,
        COALESCE(last_msg.message_text, '') AS last_message,
        COALESCE(unread.unread_count, 0) AS unread_count
      FROM manager_threads mt
      JOIN users u ON u.user_id = mt.student_id
      LEFT JOIN LATERAL (
        SELECT mm.message_text
        FROM manager_messages mm
        WHERE mm.thread_id = mt.thread_id
        ORDER BY mm.created_at DESC, mm.message_id DESC
        LIMIT 1
      ) last_msg ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS unread_count
        FROM manager_messages mm2
        WHERE mm2.thread_id = mt.thread_id
          AND mm2.sender_role = 'student'
          AND COALESCE(mm2.is_read, false) = false
      ) unread ON TRUE
      WHERE mt.manager_id = $1
      ORDER BY mt.updated_at DESC, mt.thread_id DESC
    `;

    const r = await db.query(q, [managerId]);
    res.json(r.rows);
  } catch (e) {
    console.error('manager message threads list error:', e);
    res.status(500).json({ error: 'Ошибка получения диалогов' });
  }
});

// получить сообщения конкретного диалога
router.get('/messages/threads/:threadId/messages', requireManagerUserId, async (req, res) => {
  try {
    const managerId = Number(req.user.user_id);
    const threadId = Number(req.params.threadId);

    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный threadId' });
    }

    const threadQ = await db.query(
      `SELECT
         mt.thread_id,
         mt.manager_id,
         mt.student_id,
         mt.created_at,
         mt.updated_at,
         u.full_name,
         u.email
       FROM manager_threads mt
       JOIN users u ON u.user_id = mt.student_id
       WHERE mt.thread_id = $1 AND mt.manager_id = $2
       LIMIT 1`,
      [threadId, managerId]
    );

    if (!threadQ.rows.length) {
      return res.status(404).json({ error: 'Диалог не найден' });
    }

    await db.query(
      `UPDATE manager_messages
       SET is_read = true
       WHERE thread_id = $1
         AND sender_role = 'student'
         AND COALESCE(is_read, false) = false`,
      [threadId]
    );

    const messagesQ = await db.query(
      `SELECT
         message_id,
         thread_id,
         sender_id,
         sender_role,
         message_text,
         is_read,
         created_at
       FROM manager_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC, message_id ASC`,
      [threadId]
    );

    res.json({
      thread: threadQ.rows[0],
      messages: messagesQ.rows
    });
  } catch (e) {
    console.error('manager message thread read error:', e);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
});

// отправить сообщение пользователю
router.post('/messages/threads/:threadId/messages', requireManagerUserId, async (req, res) => {
  try {
    const managerId = Number(req.user.user_id);
    const threadId = Number(req.params.threadId);
    const messageText = String(req.body.message_text || '').trim();

    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный threadId' });
    }

    if (!messageText) {
      return res.status(400).json({ error: 'Сообщение не должно быть пустым' });
    }

    const threadQ = await db.query(
      `SELECT thread_id
       FROM manager_threads
       WHERE thread_id = $1 AND manager_id = $2
       LIMIT 1`,
      [threadId, managerId]
    );

    if (!threadQ.rows.length) {
      return res.status(404).json({ error: 'Диалог не найден' });
    }

    const insertQ = await db.query(
      `INSERT INTO manager_messages (
         thread_id,
         sender_id,
         sender_role,
         message_text,
         is_read
       )
       VALUES ($1, $2, 'manager', $3, false)
       RETURNING
         message_id,
         thread_id,
         sender_id,
         sender_role,
         message_text,
         is_read,
         created_at`,
      [threadId, managerId, messageText]
    );

    await db.query(
      `UPDATE manager_threads
       SET updated_at = CURRENT_TIMESTAMP
       WHERE thread_id = $1`,
      [threadId]
    );

    res.status(201).json({
      success: true,
      message: insertQ.rows[0]
    });
  } catch (e) {
    console.error('manager send personal message error:', e);
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

router.get('/metrics', async (req, res) => {
  try {
    const [
      totalEnrollmentsQ,
      activeEnrollmentsQ,
      paidEnrollmentsQ,
      unpaidEnrollmentsQ,
      totalRevenueQ,
      monthRevenueQ,
      newUsersMonthQ,
      avgRatingQ,
      topCoursesByEnrollmentsQ,
      topCoursesByRevenueQ
    ] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS value FROM enrollments`),

      db.query(`
        SELECT COUNT(*)::int AS value
        FROM enrollments
        WHERE LOWER(COALESCE(status, '')) = 'active'
      `),

      db.query(`
        SELECT COUNT(*)::int AS value
        FROM enrollments
        WHERE LOWER(COALESCE(payment_status, '')) = 'paid'
      `),

      db.query(`
        SELECT COUNT(*)::int AS value
        FROM enrollments
        WHERE LOWER(COALESCE(payment_status, '')) IN ('unpaid', 'pending')
      `),

      db.query(`
        SELECT COALESCE(SUM(c.price), 0)::numeric(12,2) AS value
        FROM enrollments e
        JOIN courses c ON c.course_id = e.course_id
        WHERE LOWER(COALESCE(e.payment_status, '')) = 'paid'
      `),

      db.query(`
        SELECT COALESCE(SUM(c.price), 0)::numeric(12,2) AS value
        FROM enrollments e
        JOIN courses c ON c.course_id = e.course_id
        WHERE LOWER(COALESCE(e.payment_status, '')) = 'paid'
          AND DATE_TRUNC('month', e.payment_date) = DATE_TRUNC('month', CURRENT_DATE)
      `),

      db.query(`
        SELECT COUNT(*)::int AS value
        FROM users
        WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
      `),

      db.query(`
        SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::numeric(10,2) AS value
        FROM reviews
      `),

      db.query(`
        SELECT
          c.title,
          COUNT(*)::int AS enrollments_count
        FROM enrollments e
        JOIN courses c ON c.course_id = e.course_id
        GROUP BY c.course_id, c.title
        ORDER BY enrollments_count DESC, c.title ASC
        LIMIT 5
      `),

      db.query(`
        SELECT
          c.title,
          COUNT(*)::int AS paid_count,
          COALESCE(SUM(c.price), 0)::numeric(12,2) AS revenue
        FROM enrollments e
        JOIN courses c ON c.course_id = e.course_id
        WHERE LOWER(COALESCE(e.payment_status, '')) = 'paid'
        GROUP BY c.course_id, c.title
        ORDER BY revenue DESC, c.title ASC
        LIMIT 5
      `)
    ]);

    res.json({
      total_enrollments: totalEnrollmentsQ.rows[0]?.value ?? 0,
      active_enrollments: activeEnrollmentsQ.rows[0]?.value ?? 0,
      paid_enrollments: paidEnrollmentsQ.rows[0]?.value ?? 0,
      unpaid_enrollments: unpaidEnrollmentsQ.rows[0]?.value ?? 0,
      total_revenue: Number(totalRevenueQ.rows[0]?.value ?? 0),
      month_revenue: Number(monthRevenueQ.rows[0]?.value ?? 0),
      new_users_month: newUsersMonthQ.rows[0]?.value ?? 0,
      avg_rating: Number(avgRatingQ.rows[0]?.value ?? 0),
      top_courses_by_enrollments: topCoursesByEnrollmentsQ.rows,
      top_courses_by_revenue: topCoursesByRevenueQ.rows
    });
  } catch (e) {
    console.error('manager metrics error:', e);
    res.status(500).json({ error: 'Ошибка получения метрик' });
  }
});

export default router;