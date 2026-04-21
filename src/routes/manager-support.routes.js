import { Router } from 'express';
import db from '../config/db.js';
import auth from '../middleware/auth.js';

const router = Router();

function isManagerOrAdmin(req) {
  const role = req.user?.role || req.headers['x-role'];
  return role === 'manager' || role === 'admin';
}

async function getThreadById(threadId) {
  const q = await db.query(
    `SELECT
       t.thread_id,
       t.user_id,
       t.subject,
       t.status,
       t.created_at,
       t.updated_at,
       u.full_name,
       u.email
     FROM support_threads t
     JOIN users u ON u.user_id = t.user_id
     WHERE t.thread_id = $1`,
    [threadId]
  );

  return q.rows[0] || null;
}

// список всех обращений
router.get('/threads', auth, async (req, res) => {
  try {
    if (!isManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const status = String(req.query.status || '').trim().toLowerCase();

    const values = [];
    let whereSql = '';

    if (status === 'open' || status === 'closed') {
      values.push(status);
      whereSql = `WHERE t.status = $1`;
    }

    const q = await db.query(
      `SELECT
         t.thread_id,
         t.user_id,
         t.subject,
         t.status,
         t.created_at,
         t.updated_at,
         u.full_name,
         u.email,
         (
           SELECT COUNT(*)
           FROM support_messages sm
           WHERE sm.thread_id = t.thread_id
             AND sm.sender_role = 'student'
             AND sm.is_read = FALSE
         )::int AS unread_count,
         (
           SELECT sm2.message_text
           FROM support_messages sm2
           WHERE sm2.thread_id = t.thread_id
           ORDER BY sm2.created_at DESC
           LIMIT 1
         ) AS last_message
       FROM support_threads t
       JOIN users u ON u.user_id = t.user_id
       ${whereSql}
       ORDER BY
         CASE WHEN t.status = 'open' THEN 0 ELSE 1 END,
         t.updated_at DESC`,
      values
    );

    res.json(q.rows);
  } catch (e) {
    console.error('GET /manager/support/threads error:', e);
    res.status(500).json({ error: 'Ошибка получения обращений поддержки' });
  }
});

// сообщения по обращению
router.get('/threads/:threadId/messages', auth, async (req, res) => {
  try {
    if (!isManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const threadId = Number(req.params.threadId);

    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный threadId' });
    }

    const thread = await getThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    const messagesQ = await db.query(
      `SELECT
         message_id,
         thread_id,
         sender_id,
         sender_role,
         message_text,
         is_read,
         created_at
       FROM support_messages
       WHERE thread_id = $1
       ORDER BY created_at ASC`,
      [threadId]
    );

    await db.query(
      `UPDATE support_messages
       SET is_read = TRUE
       WHERE thread_id = $1
         AND sender_role = 'student'
         AND is_read = FALSE`,
      [threadId]
    );

    res.json({
      thread,
      messages: messagesQ.rows
    });
  } catch (e) {
    console.error('GET /manager/support/threads/:threadId/messages error:', e);
    res.status(500).json({ error: 'Ошибка получения сообщений поддержки' });
  }
});

// ответ менеджера
router.post('/threads/:threadId/messages', auth, async (req, res) => {
  try {
    if (!isManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const threadId = Number(req.params.threadId);
    const senderId = req.user.user_id;
    const senderRole = req.user.role || req.headers['x-role'] || 'manager';
    const messageText = String(req.body.message_text || '').trim();

    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный threadId' });
    }

    if (!messageText) {
      return res.status(400).json({ error: 'Сообщение не должно быть пустым' });
    }

    const thread = await getThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    if (thread.status === 'closed') {
      return res.status(400).json({ error: 'Обращение закрыто' });
    }

    const insertQ = await db.query(
      `INSERT INTO support_messages (thread_id, sender_id, sender_role, message_text, is_read)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING message_id, thread_id, sender_id, sender_role, message_text, is_read, created_at`,
      [threadId, senderId, senderRole, messageText]
    );

    await db.query(
      `UPDATE support_threads
       SET updated_at = CURRENT_TIMESTAMP
       WHERE thread_id = $1`,
      [threadId]
    );

    res.status(201).json({
      success: true,
      message: insertQ.rows[0]
    });
  } catch (e) {
    console.error('POST /manager/support/threads/:threadId/messages error:', e);
    res.status(500).json({ error: 'Ошибка отправки ответа' });
  }
});

// смена статуса
router.patch('/threads/:threadId/status', auth, async (req, res) => {
  try {
    if (!isManagerOrAdmin(req)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }

    const threadId = Number(req.params.threadId);
    const status = String(req.body.status || '').trim().toLowerCase();

    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный threadId' });
    }

    if (!['open', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Некорректный статус' });
    }

    const thread = await getThreadById(threadId);
    if (!thread) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    const q = await db.query(
      `UPDATE support_threads
       SET status = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE thread_id = $1
       RETURNING thread_id, status, updated_at`,
      [threadId, status]
    );

    res.json({
      success: true,
      thread: q.rows[0]
    });
  } catch (e) {
    console.error('PATCH /manager/support/threads/:threadId/status error:', e);
    res.status(500).json({ error: 'Ошибка изменения статуса обращения' });
  }
});

export default router;