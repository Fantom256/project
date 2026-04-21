import { Router } from 'express';
import db from '../config/db.js';
import auth from '../middleware/auth.js';

const router = Router();

async function getThreadForUser(threadId, userId) {
  const q = await db.query(
    `SELECT thread_id, user_id, subject, status, created_at, updated_at
     FROM support_threads
     WHERE thread_id = $1 AND user_id = $2`,
    [threadId, userId]
  );

  return q.rows[0] || null;
}

// список своих обращений
router.get('/my-threads', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const q = await db.query(
      `SELECT
         t.thread_id,
         t.subject,
         t.status,
         t.created_at,
         t.updated_at,
         (
           SELECT COUNT(*)
           FROM support_messages sm
           WHERE sm.thread_id = t.thread_id
             AND sm.sender_role IN ('manager', 'admin')
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
       WHERE t.user_id = $1
       ORDER BY t.updated_at DESC`,
      [userId]
    );

    res.json(q.rows);
  } catch (e) {
    console.error('GET /support/my-threads error:', e);
    res.status(500).json({ error: 'Ошибка получения обращений' });
  }
});

// создать новое обращение + первое сообщение
router.post('/threads', auth, async (req, res) => {
  const client = await db.connect();

  try {
    const userId = req.user.user_id;
    const userRole = req.user.role || 'student';
    const subject = String(req.body.subject || '').trim();
    const messageText = String(req.body.message_text || '').trim();

    if (!subject) {
      return res.status(400).json({ error: 'Тема обращения обязательна' });
    }

    if (!messageText) {
      return res.status(400).json({ error: 'Сообщение не должно быть пустым' });
    }

    await client.query('BEGIN');

    const threadQ = await client.query(
      `INSERT INTO support_threads (user_id, subject)
       VALUES ($1, $2)
       RETURNING thread_id, user_id, subject, status, created_at, updated_at`,
      [userId, subject]
    );

    const thread = threadQ.rows[0];

    await client.query(
      `INSERT INTO support_messages (thread_id, sender_id, sender_role, message_text, is_read)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [thread.thread_id, userId, userRole, messageText]
    );

    await client.query(
      `UPDATE support_threads
       SET updated_at = CURRENT_TIMESTAMP
       WHERE thread_id = $1`,
      [thread.thread_id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      thread
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('POST /support/threads error:', e);
    res.status(500).json({ error: 'Ошибка создания обращения' });
  } finally {
    client.release();
  }
});

// получить сообщения своего обращения
router.get('/threads/:threadId/messages', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const threadId = Number(req.params.threadId);

    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный threadId' });
    }

    const thread = await getThreadForUser(threadId, userId);
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
         AND sender_role IN ('manager', 'admin')
         AND is_read = FALSE`,
      [threadId]
    );

    res.json({
      thread,
      messages: messagesQ.rows
    });
  } catch (e) {
    console.error('GET /support/threads/:threadId/messages error:', e);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
});

// отправить сообщение в своё обращение
router.post('/threads/:threadId/messages', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const userRole = req.user.role || 'student';
    const threadId = Number(req.params.threadId);
    const messageText = String(req.body.message_text || '').trim();

    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный threadId' });
    }

    if (!messageText) {
      return res.status(400).json({ error: 'Сообщение не должно быть пустым' });
    }

    const thread = await getThreadForUser(threadId, userId);
    if (!thread) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    if (thread.status === 'closed') {
      return res.status(400).json({ error: 'Обращение уже закрыто' });
    }

    const insertQ = await db.query(
      `INSERT INTO support_messages (thread_id, sender_id, sender_role, message_text, is_read)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING message_id, thread_id, sender_id, sender_role, message_text, is_read, created_at`,
      [threadId, userId, userRole, messageText]
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
    console.error('POST /support/threads/:threadId/messages error:', e);
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

// пользователь может закрыть своё обращение
router.patch('/threads/:threadId/close', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const threadId = Number(req.params.threadId);

    if (!threadId) {
      return res.status(400).json({ error: 'Некорректный threadId' });
    }

    const thread = await getThreadForUser(threadId, userId);
    if (!thread) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    const q = await db.query(
      `UPDATE support_threads
       SET status = 'closed',
           updated_at = CURRENT_TIMESTAMP
       WHERE thread_id = $1
       RETURNING thread_id, status, updated_at`,
      [threadId]
    );

    res.json({
      success: true,
      thread: q.rows[0]
    });
  } catch (e) {
    console.error('PATCH /support/threads/:threadId/close error:', e);
    res.status(500).json({ error: 'Ошибка закрытия обращения' });
  }
});

export default router;