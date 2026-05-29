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

function requireSupport(req, res, next) {
  if (getUserRole(req) !== 'support') {
    return res.status(403).json({ error: 'Доступ только для центра поддержки' });
  }
  next();
}

function requireStudent(req, res, next) {
  if (getUserRole(req) !== 'student') {
    return res.status(403).json({ error: 'Доступ только для пользователя' });
  }
  next();
}

async function getThreadById(threadId) {
  const q = await db.query(
    `SELECT
       st.thread_id,
       st.user_id,
       st.subject,
       st.status,
       st.created_at,
       st.updated_at,
       u.full_name,
       u.email
     FROM support_threads st
     JOIN users u ON u.user_id = st.user_id
     WHERE st.thread_id = $1
     LIMIT 1`,
    [threadId]
  );

  return q.rows[0] || null;
}

async function getUserThreadById(threadId, userId) {
  const q = await db.query(
    `SELECT
       st.thread_id,
       st.user_id,
       st.subject,
       st.status,
       st.created_at,
       st.updated_at
     FROM support_threads st
     WHERE st.thread_id = $1
       AND st.user_id = $2
     LIMIT 1`,
    [threadId, userId]
  );

  return q.rows[0] || null;
}

/* =========================================
   SUPPORT SIDE
========================================= */

router.get('/threads', requireAuth, requireSupport, async (req, res) => {
  try {
    const onlyOpen = String(req.query.status || '') === 'open';

    const q = `
      SELECT
        st.thread_id,
        st.user_id,
        st.subject,
        st.status,
        st.created_at,
        st.updated_at,
        u.full_name,
        u.email,
        COALESCE(last_msg.message_text, '') AS last_message,
        COALESCE(unread.unread_count, 0) AS unread_count
      FROM support_threads st
      JOIN users u ON u.user_id = st.user_id
      LEFT JOIN LATERAL (
        SELECT sm.message_text
        FROM support_messages sm
        WHERE sm.thread_id = st.thread_id
        ORDER BY sm.created_at DESC
        LIMIT 1
      ) last_msg ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS unread_count
        FROM support_messages sm2
        WHERE sm2.thread_id = st.thread_id
          AND sm2.sender_role = 'student'
          AND COALESCE(sm2.is_read, false) = false
      ) unread ON TRUE
      ${onlyOpen ? `WHERE st.status = 'open'` : ``}
      ORDER BY st.updated_at DESC, st.thread_id DESC
    `;

    const r = await db.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error('support threads error:', e);
    res.status(500).json({ error: 'Ошибка загрузки обращений' });
  }
});

router.get('/threads/:threadId/messages', requireAuth, requireSupport, async (req, res) => {
  try {
    const threadId = Number(req.params.threadId);
    const thread = await getThreadById(threadId);

    if (!thread) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    await db.query(
      `
      UPDATE support_messages
      SET is_read = true
      WHERE thread_id = $1
        AND sender_role = 'student'
        AND COALESCE(is_read, false) = false
      `,
      [threadId]
    );

    const messagesQ = await db.query(
      `
      SELECT
        message_id,
        thread_id,
        sender_id,
        sender_role,
        message_text,
        is_read,
        created_at
      FROM support_messages
      WHERE thread_id = $1
      ORDER BY created_at ASC, message_id ASC
      `,
      [threadId]
    );

    res.json({
      thread,
      messages: messagesQ.rows
    });
  } catch (e) {
    console.error('support messages error:', e);
    res.status(500).json({ error: 'Ошибка загрузки сообщений' });
  }
});

router.post('/threads/:threadId/messages', requireAuth, requireSupport, async (req, res) => {
  try {
    const threadId = Number(req.params.threadId);
    const messageText = String(req.body.message_text || '').trim();
    const senderId = getUserId(req);

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
      return res.status(400).json({ error: 'Нельзя ответить в закрытое обращение' });
    }

    const insertQ = await db.query(
      `
      INSERT INTO support_messages (
        thread_id,
        sender_id,
        sender_role,
        message_text,
        is_read
      )
      VALUES ($1, $2, 'support', $3, false)
      RETURNING *
      `,
      [threadId, senderId, messageText]
    );

    await db.query(
      `
      UPDATE support_threads
      SET updated_at = CURRENT_TIMESTAMP
      WHERE thread_id = $1
      `,
      [threadId]
    );

    res.status(201).json({
      success: true,
      message: insertQ.rows[0]
    });
  } catch (e) {
    console.error('support reply error:', e);
    res.status(500).json({ error: 'Ошибка отправки ответа' });
  }
});

router.patch('/threads/:threadId/status', requireAuth, requireSupport, async (req, res) => {
  try {
    const threadId = Number(req.params.threadId);
    const { status } = req.body;

    if (!['open', 'closed'].includes(String(status || '').trim().toLowerCase())) {
      return res.status(400).json({ error: 'Недопустимый статус обращения' });
    }

    const q = `
      UPDATE support_threads
      SET status = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE thread_id = $1
      RETURNING thread_id, status, updated_at
    `;

    const r = await db.query(q, [threadId, status]);

    if (!r.rows.length) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    res.json({ success: true, ...r.rows[0] });
  } catch (e) {
    console.error('support status error:', e);
    res.status(500).json({ error: 'Ошибка изменения статуса обращения' });
  }
});

/* =========================================
   USER SIDE
========================================= */

router.get('/my/threads', requireAuth, requireStudent, async (req, res) => {
  try {
    const userId = getUserId(req);

    const q = `
      SELECT
        st.thread_id,
        st.subject,
        st.status,
        st.created_at,
        st.updated_at,
        COALESCE(last_msg.message_text, '') AS last_message,
        COALESCE(unread.unread_count, 0) AS unread_count
      FROM support_threads st
      LEFT JOIN LATERAL (
        SELECT sm.message_text
        FROM support_messages sm
        WHERE sm.thread_id = st.thread_id
        ORDER BY sm.created_at DESC
        LIMIT 1
      ) last_msg ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS unread_count
        FROM support_messages sm2
        WHERE sm2.thread_id = st.thread_id
          AND sm2.sender_role = 'support'
          AND COALESCE(sm2.is_read, false) = false
      ) unread ON TRUE
      WHERE st.user_id = $1
      ORDER BY
        CASE WHEN st.status = 'open' THEN 0 ELSE 1 END,
        st.updated_at DESC
    `;

    const r = await db.query(q, [userId]);
    res.json(r.rows);
  } catch (e) {
    console.error('user support my threads error:', e);
    res.status(500).json({ error: 'Ошибка загрузки ваших обращений' });
  }
});

router.post('/my/threads', requireAuth, requireStudent, async (req, res) => {
  try {
    const userId = getUserId(req);
    const subject = String(req.body.subject || '').trim();
    const messageText = String(req.body.message_text || '').trim();

    if (!subject) {
      return res.status(400).json({ error: 'Тема обращения обязательна' });
    }

    if (!messageText) {
      return res.status(400).json({ error: 'Сообщение не должно быть пустым' });
    }

    const threadQ = await db.query(
      `
      INSERT INTO support_threads (
        user_id,
        subject,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
      `,
      [userId, subject]
    );

    const thread = threadQ.rows[0];

    await db.query(
      `
      INSERT INTO support_messages (
        thread_id,
        sender_id,
        sender_role,
        message_text,
        is_read,
        created_at
      )
      VALUES ($1, $2, 'student', $3, false, CURRENT_TIMESTAMP)
      `,
      [thread.thread_id, userId, messageText]
    );

    res.status(201).json({
      success: true,
      thread
    });
  } catch (e) {
    console.error('user support create thread error:', e);
    res.status(500).json({ error: 'Ошибка создания обращения' });
  }
});

router.get('/my/threads/:threadId/messages', requireAuth, requireStudent, async (req, res) => {
  try {
    const userId = getUserId(req);
    const threadId = Number(req.params.threadId);

    const thread = await getUserThreadById(threadId, userId);
    if (!thread) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    await db.query(
      `
      UPDATE support_messages
      SET is_read = true
      WHERE thread_id = $1
        AND sender_role = 'support'
        AND COALESCE(is_read, false) = false
      `,
      [threadId]
    );

    const messagesQ = await db.query(
      `
      SELECT
        message_id,
        thread_id,
        sender_id,
        sender_role,
        message_text,
        is_read,
        created_at
      FROM support_messages
      WHERE thread_id = $1
      ORDER BY created_at ASC, message_id ASC
      `,
      [threadId]
    );

    res.json({
      thread,
      messages: messagesQ.rows
    });
  } catch (e) {
    console.error('user support get thread messages error:', e);
    res.status(500).json({ error: 'Ошибка загрузки сообщений' });
  }
});

router.post('/my/threads/:threadId/messages', requireAuth, requireStudent, async (req, res) => {
  try {
    const userId = getUserId(req);
    const threadId = Number(req.params.threadId);
    const messageText = String(req.body.message_text || '').trim();

    if (!messageText) {
      return res.status(400).json({ error: 'Сообщение не должно быть пустым' });
    }

    const thread = await getUserThreadById(threadId, userId);
    if (!thread) {
      return res.status(404).json({ error: 'Обращение не найдено' });
    }

    if (thread.status === 'closed') {
      return res.status(400).json({ error: 'Обращение закрыто' });
    }

    const insertQ = await db.query(
      `
      INSERT INTO support_messages (
        thread_id,
        sender_id,
        sender_role,
        message_text,
        is_read,
        created_at
      )
      VALUES ($1, $2, 'student', $3, false, CURRENT_TIMESTAMP)
      RETURNING *
      `,
      [threadId, userId, messageText]
    );

    await db.query(
      `
      UPDATE support_threads
      SET updated_at = CURRENT_TIMESTAMP
      WHERE thread_id = $1
      `,
      [threadId]
    );

    res.status(201).json({
      success: true,
      message: insertQ.rows[0]
    });
  } catch (e) {
    console.error('user support send message error:', e);
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

export default router;