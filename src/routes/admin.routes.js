import { Router } from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';

const router = Router();

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;

  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET);

      if (payload?.role === 'admin') {
        req.user = payload;
        return next();
      }

      return res.status(403).json({ error: 'Доступ только для администратора' });
    } catch {
      return res.status(401).json({ error: 'Неверный токен' });
    }
  }

  if (req.headers['x-role'] !== 'admin') {
    return res.status(403).json({ error: 'Доступ только для администратора' });
  }

  next();
}

router.use(requireAdmin);

const ALLOWED_TABLES = new Set([
  'users',
  'roles',
  'categories',
  'courses',
  'enrollments',
  'payments',
  'reviews',
  'lessons',
  'lesson_progress',
  'lesson_test_cases',
  'support_threads',
  'support_messages',
  'manager_threads',
  'manager_messages',
  'achievements',
  'user_achievements',
  'user_game_stats',
  'user_xp_log',
  'teachers',
  'consultations'
]);

const TABLE_ORDER = {
  users: 'user_id DESC',
  roles: 'role_id ASC',
  categories: 'category_id ASC',
  courses: 'course_id DESC',
  enrollments: 'enrollment_id DESC',
  payments: 'payment_id DESC',
  reviews: 'review_id DESC',
  lessons: 'lesson_id ASC',
  lesson_progress: 'progress_id DESC',
  lesson_test_cases: 'test_case_id DESC',
  support_threads: 'thread_id DESC',
  support_messages: 'message_id DESC',
  manager_threads: 'thread_id DESC',
  manager_messages: 'message_id DESC',
  achievements: 'achievement_id ASC',
  user_achievements: 'user_achievement_id DESC',
  user_game_stats: 'user_id DESC',
  user_xp_log: 'xp_log_id DESC',
  teachers: 'teacher_id DESC',
  consultations: 'consultation_id DESC'
};

/* =========================================
   DB OVERVIEW
========================================= */
router.get('/db/overview', async (req, res) => {
  try {
    const [
      users,
      categories,
      courses,
      enrollments,
      payments,
      reviews,
      lessons,
      lessonProgress,
      lessonTestCases,
      supportThreads,
      supportMessages,
      managerThreads,
      managerMessages,
      achievements,
      userAchievements,
      userGameStats,
      userXpLog,
      teachers,
      consultations,
      lastUser,
      lastEnrollment,
      lastPayment,
      lastSupportMessage,
      lastManagerMessage
    ] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS count FROM users`),
      db.query(`SELECT COUNT(*)::int AS count FROM categories`),
      db.query(`SELECT COUNT(*)::int AS count FROM courses`),
      db.query(`SELECT COUNT(*)::int AS count FROM enrollments`),
      db.query(`SELECT COUNT(*)::int AS count FROM payments`),
      db.query(`SELECT COUNT(*)::int AS count FROM reviews`),
      db.query(`SELECT COUNT(*)::int AS count FROM lessons`),
      db.query(`SELECT COUNT(*)::int AS count FROM lesson_progress`),
      db.query(`SELECT COUNT(*)::int AS count FROM lesson_test_cases`),
      db.query(`SELECT COUNT(*)::int AS count FROM support_threads`),
      db.query(`SELECT COUNT(*)::int AS count FROM support_messages`),
      db.query(`SELECT COUNT(*)::int AS count FROM manager_threads`),
      db.query(`SELECT COUNT(*)::int AS count FROM manager_messages`),
      db.query(`SELECT COUNT(*)::int AS count FROM achievements`),
      db.query(`SELECT COUNT(*)::int AS count FROM user_achievements`),
      db.query(`SELECT COUNT(*)::int AS count FROM user_game_stats`),
      db.query(`SELECT COUNT(*)::int AS count FROM user_xp_log`),
      db.query(`SELECT COUNT(*)::int AS count FROM teachers`),
      db.query(`SELECT COUNT(*)::int AS count FROM consultations`),
      db.query(`SELECT MAX(created_at) AS value FROM users`),
      db.query(`SELECT MAX(enrolled_at) AS value FROM enrollments`),
      db.query(`SELECT MAX(created_at) AS value FROM payments`),
      db.query(`SELECT MAX(created_at) AS value FROM support_messages`),
      db.query(`SELECT MAX(created_at) AS value FROM manager_messages`)
    ]);

    res.json({
      counts: {
        users: users.rows[0].count,
        categories: categories.rows[0].count,
        courses: courses.rows[0].count,
        enrollments: enrollments.rows[0].count,
        payments: payments.rows[0].count,
        reviews: reviews.rows[0].count,
        lessons: lessons.rows[0].count,
        lesson_progress: lessonProgress.rows[0].count,
        lesson_test_cases: lessonTestCases.rows[0].count,
        support_threads: supportThreads.rows[0].count,
        support_messages: supportMessages.rows[0].count,
        manager_threads: managerThreads.rows[0].count,
        manager_messages: managerMessages.rows[0].count,
        achievements: achievements.rows[0].count,
        user_achievements: userAchievements.rows[0].count,
        user_game_stats: userGameStats.rows[0].count,
        user_xp_log: userXpLog.rows[0].count,
        teachers: teachers.rows[0].count,
        consultations: consultations.rows[0].count
      },
      meta: {
        last_user_created_at: lastUser.rows[0].value,
        last_enrollment_at: lastEnrollment.rows[0].value,
        last_payment_at: lastPayment.rows[0].value,
        last_support_message_at: lastSupportMessage.rows[0].value,
        last_manager_message_at: lastManagerMessage.rows[0].value
      }
    });
  } catch (e) {
    console.error('admin db overview error:', e);
    res.status(500).json({ error: 'Ошибка получения обзора БД' });
  }
});

/* =========================================
   TABLE LIST
========================================= */
router.get('/db/tables', async (req, res) => {
  res.json({
    tables: Array.from(ALLOWED_TABLES)
  });
});

/* =========================================
   TABLE ROWS
========================================= */
router.get('/db/table/:tableName/rows', async (req, res) => {
  try {
    const tableName = String(req.params.tableName || '').trim();

    if (!ALLOWED_TABLES.has(tableName)) {
      return res.status(400).json({ error: 'Таблица недоступна' });
    }

    const rawLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 200)
      : 50;

    const orderBy = TABLE_ORDER[tableName] || '1';
    const query = `SELECT * FROM ${tableName} ORDER BY ${orderBy} LIMIT ${limit}`;
    const result = await db.query(query);

    res.json({
      table: tableName,
      columns: result.fields.map(f => f.name),
      rows: result.rows
    });
  } catch (e) {
    console.error('admin db table rows error:', e);
    res.status(500).json({ error: 'Ошибка получения данных таблицы' });
  }
});

/* =========================================
   TABLE STRUCTURE
========================================= */
router.get('/db/table/:tableName/structure', async (req, res) => {
  try {
    const tableName = String(req.params.tableName || '').trim();

    if (!ALLOWED_TABLES.has(tableName)) {
      return res.status(400).json({ error: 'Таблица недоступна' });
    }

    const q = `
      WITH pk AS (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = $1
          AND tc.constraint_type = 'PRIMARY KEY'
      )
      SELECT
        c.ordinal_position,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary_key
      FROM information_schema.columns c
      LEFT JOIN pk ON pk.column_name = c.column_name
      WHERE c.table_schema = 'public'
        AND c.table_name = $1
      ORDER BY c.ordinal_position
    `;

    const result = await db.query(q, [tableName]);

    res.json({
      table: tableName,
      columns: result.rows
    });
  } catch (e) {
    console.error('admin db structure error:', e);
    res.status(500).json({ error: 'Ошибка получения структуры таблицы' });
  }
});

/* =========================================
   INTEGRITY CHECKS
========================================= */
router.get('/db/integrity', async (req, res) => {
  try {
    const checks = await Promise.all([
      db.query(`
        SELECT COUNT(*)::int AS count
        FROM courses c
        LEFT JOIN categories cat ON cat.category_id = c.category_id
        WHERE c.category_id IS NOT NULL
          AND cat.category_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM reviews r
        LEFT JOIN users u ON u.user_id = r.user_id
        WHERE u.user_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM reviews r
        LEFT JOIN courses c ON c.course_id = r.course_id
        WHERE c.course_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM lessons l
        LEFT JOIN courses c ON c.course_id = l.course_id
        WHERE c.course_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM support_threads st
        LEFT JOIN users u ON u.user_id = st.user_id
        WHERE u.user_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM support_messages sm
        LEFT JOIN support_threads st ON st.thread_id = sm.thread_id
        WHERE st.thread_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM courses
        WHERE title IS NULL OR trim(title) = ''
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM categories
        WHERE name IS NULL OR trim(name) = ''
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM payments p
        LEFT JOIN enrollments e ON e.enrollment_id = p.enrollment_id
        WHERE e.enrollment_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM payments p
        LEFT JOIN users u ON u.user_id = p.user_id
        WHERE u.user_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM manager_threads mt
        LEFT JOIN users u ON u.user_id = mt.student_id
        WHERE u.user_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM manager_messages mm
        LEFT JOIN manager_threads mt ON mt.thread_id = mm.thread_id
        WHERE mt.thread_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM lesson_progress lp
        LEFT JOIN users u ON u.user_id = lp.user_id
        WHERE u.user_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM lesson_progress lp
        LEFT JOIN lessons l ON l.lesson_id = lp.lesson_id
        WHERE l.lesson_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM lesson_test_cases ltc
        LEFT JOIN lessons l ON l.lesson_id = ltc.lesson_id
        WHERE l.lesson_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM user_achievements ua
        LEFT JOIN users u ON u.user_id = ua.user_id
        WHERE u.user_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM user_achievements ua
        LEFT JOIN achievements a ON a.achievement_id = ua.achievement_id
        WHERE a.achievement_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM user_game_stats ugs
        LEFT JOIN users u ON u.user_id = ugs.user_id
        WHERE u.user_id IS NULL
      `),

      db.query(`
        SELECT COUNT(*)::int AS count
        FROM user_xp_log xl
        LEFT JOIN users u ON u.user_id = xl.user_id
        WHERE u.user_id IS NULL
      `)
    ]);

    res.json({
      checks: [
        { key: 'courses_without_category', title: 'Курсы без существующей категории', problems: checks[0].rows[0].count },
        { key: 'reviews_without_user', title: 'Отзывы без существующего пользователя', problems: checks[1].rows[0].count },
        { key: 'reviews_without_course', title: 'Отзывы без существующего курса', problems: checks[2].rows[0].count },
        { key: 'lessons_without_course', title: 'Уроки без существующего курса', problems: checks[3].rows[0].count },
        { key: 'support_threads_without_user', title: 'Обращения поддержки без пользователя', problems: checks[4].rows[0].count },
        { key: 'support_messages_without_thread', title: 'Сообщения поддержки без обращения', problems: checks[5].rows[0].count },
        { key: 'courses_without_title', title: 'Курсы без названия', problems: checks[6].rows[0].count },
        { key: 'categories_without_name', title: 'Категории без названия', problems: checks[7].rows[0].count },
        { key: 'payments_without_enrollment', title: 'Платежи без записи на курс', problems: checks[8].rows[0].count },
        { key: 'payments_without_user', title: 'Платежи без пользователя', problems: checks[9].rows[0].count },
        { key: 'manager_threads_without_student', title: 'Личные диалоги без пользователя', problems: checks[10].rows[0].count },
        { key: 'manager_messages_without_thread', title: 'Личные сообщения без диалога', problems: checks[11].rows[0].count },
        { key: 'lesson_progress_without_user', title: 'Прогресс уроков без пользователя', problems: checks[12].rows[0].count },
        { key: 'lesson_progress_without_lesson', title: 'Прогресс уроков без урока', problems: checks[13].rows[0].count },
        { key: 'lesson_test_cases_without_lesson', title: 'Тест-кейсы без урока', problems: checks[14].rows[0].count },
        { key: 'user_achievements_without_user', title: 'Достижения пользователя без пользователя', problems: checks[15].rows[0].count },
        { key: 'user_achievements_without_achievement', title: 'Достижения пользователя без достижения', problems: checks[16].rows[0].count },
        { key: 'user_game_stats_without_user', title: 'Игровая статистика без пользователя', problems: checks[17].rows[0].count },
        { key: 'user_xp_log_without_user', title: 'XP-лог без пользователя', problems: checks[18].rows[0].count }
      ]
    });
  } catch (e) {
    console.error('admin db integrity error:', e);
    res.status(500).json({ error: 'Ошибка проверки целостности БД' });
  }
});

export default router;