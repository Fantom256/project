import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';

const router = Router();

function getUserId(req) {
  return req.user?.user_id ?? req.user?.id ?? null;
}

function getUserRole(req) {
  return req.user?.role ?? null;
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Неверный токен' });
  }
}

function requireStudent(req, res, next) {
  if (getUserRole(req) !== 'student') {
    return res.status(403).json({ error: 'Доступ только для пользователя' });
  }

  next();
}

router.use(requireAuth, requireStudent);

/* =========================================
   USER PERSONAL MESSAGES
========================================= */

// список диалогов пользователя
router.get('/threads', async (req, res) => {
  try {
    const studentId = Number(getUserId(req));

    const q = `
      SELECT
        mt.thread_id,
        mt.manager_id,
        mt.student_id,
        mt.created_at,
        mt.updated_at,
        u.full_name AS manager_name,
        u.email AS manager_email,
        COALESCE(last_msg.message_text, '') AS last_message,
        COALESCE(unread.unread_count, 0) AS unread_count
      FROM manager_threads mt
      JOIN users u ON u.user_id = mt.manager_id
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
          AND mm2.sender_role = 'manager'
          AND COALESCE(mm2.is_read, false) = false
      ) unread ON TRUE
      WHERE mt.student_id = $1
      ORDER BY mt.updated_at DESC, mt.thread_id DESC
    `;

    const r = await db.query(q, [studentId]);
    res.json(r.rows);
  } catch (e) {
    console.error('user message threads list error:', e);
    res.status(500).json({ error: 'Ошибка получения диалогов' });
  }
});

// получить сообщения конкретного диалога
router.get('/threads/:threadId/messages', async (req, res) => {
  try {
    const studentId = Number(getUserId(req));
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
         u.full_name AS manager_name,
         u.email AS manager_email
       FROM manager_threads mt
       JOIN users u ON u.user_id = mt.manager_id
       WHERE mt.thread_id = $1 AND mt.student_id = $2
       LIMIT 1`,
      [threadId, studentId]
    );

    if (!threadQ.rows.length) {
      return res.status(404).json({ error: 'Диалог не найден' });
    }

    await db.query(
      `UPDATE manager_messages
       SET is_read = true
       WHERE thread_id = $1
         AND sender_role = 'manager'
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
    console.error('user message thread read error:', e);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
});

// отправить сообщение менеджеру
router.post('/threads/:threadId/messages', async (req, res) => {
  try {
    const studentId = Number(getUserId(req));
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
       WHERE thread_id = $1 AND student_id = $2
       LIMIT 1`,
      [threadId, studentId]
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
       VALUES ($1, $2, 'student', $3, false)
       RETURNING
         message_id,
         thread_id,
         sender_id,
         sender_role,
         message_text,
         is_read,
         created_at`,
      [threadId, studentId, messageText]
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
    console.error('user send personal message error:', e);
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

export default router;