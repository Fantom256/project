import { Router } from 'express';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import db from '../config/db.js';
import auth from '../middleware/auth.js';
import { handleLessonCompletionGamification } from '../utils/gamification.js';

const router = Router();

function normalizeOutput(text = '') {
  return String(text).replace(/\r\n/g, '\n').trim();
}

function runPythonFile(filePath, stdinText = '') {
  return new Promise((resolve, reject) => {
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

    const child = spawn(pythonCommand, ['-X', 'utf8', filePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1'
      }
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      reject(new Error('TIMEOUT'));
    }, 3000);

    child.stdout.on('data', (data) => {
      stdout += data.toString('utf8');
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString('utf8');
    });

    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });

    child.stdin.write(stdinText, 'utf8');
    child.stdin.end();
  });
}

async function runUserPython(code, stdinText = '') {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lesson-check-'));
  const filePath = path.join(tempDir, 'solution.py');

  try {
    await fs.writeFile(filePath, code, 'utf8');
    return await runPythonFile(filePath, stdinText);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function hasEnrollment(userId, courseId) {
  const q = await db.query(
    `SELECT 1
     FROM enrollments
     WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId]
  );

  return q.rows.length > 0;
}

async function setPracticePassed(userId, lessonId, passed) {
  await db.query(
    `INSERT INTO lesson_progress (
       user_id,
       lesson_id,
       is_completed,
       practice_passed,
       practice_passed_at
     )
     VALUES (
       $1,
       $2,
       FALSE,
       $3,
       CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END
     )
     ON CONFLICT (user_id, lesson_id)
     DO UPDATE SET
       practice_passed = EXCLUDED.practice_passed,
       practice_passed_at = EXCLUDED.practice_passed_at`,
    [userId, lessonId, passed]
  );
}

// Список уроков курса
router.get('/course/:courseId', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const courseId = Number(req.params.courseId);

    if (!courseId) {
      return res.status(400).json({ error: 'Некорректный courseId' });
    }

    const enrolled = await hasEnrollment(userId, courseId);
    if (!enrolled) {
      return res.status(403).json({ error: 'Сначала запишитесь на курс' });
    }

    const q = await db.query(
      `SELECT
         l.lesson_id,
         l.course_id,
         l.title,
         l.lesson_order,
         COALESCE(lp.is_completed, FALSE) AS is_completed,
         COALESCE(lp.practice_passed, FALSE) AS practice_passed,
         lp.completed_at,
         lp.practice_passed_at
       FROM lessons l
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id = l.lesson_id
        AND lp.user_id = $2
       WHERE l.course_id = $1
       ORDER BY l.lesson_order`,
      [courseId, userId]
    );

    return res.json(q.rows);
  } catch (e) {
    console.error('GET /lessons/course/:courseId error:', e);
    return res.status(500).json({ error: 'Ошибка получения уроков' });
  }
});

// Получить один урок
router.get('/:lessonId', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const lessonId = Number(req.params.lessonId);

    if (!lessonId) {
      return res.status(400).json({ error: 'Некорректный lessonId' });
    }

    const lessonQ = await db.query(
      `SELECT
         l.lesson_id,
         l.course_id,
         l.title,
         l.content,
         l.lesson_order,
         COALESCE(lp.is_completed, FALSE) AS is_completed,
         COALESCE(lp.practice_passed, FALSE) AS practice_passed,
         lp.completed_at,
         lp.practice_passed_at
       FROM lessons l
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id = l.lesson_id
        AND lp.user_id = $2
       WHERE l.lesson_id = $1`,
      [lessonId, userId]
    );

    if (!lessonQ.rows.length) {
      return res.status(404).json({ error: 'Урок не найден' });
    }

    const lesson = lessonQ.rows[0];

    const enrolled = await hasEnrollment(userId, lesson.course_id);
    if (!enrolled) {
      return res.status(403).json({ error: 'Сначала запишитесь на курс' });
    }

    const prevQ = await db.query(
      `SELECT lesson_id, title
       FROM lessons
       WHERE course_id = $1 AND lesson_order < $2
       ORDER BY lesson_order DESC
       LIMIT 1`,
      [lesson.course_id, lesson.lesson_order]
    );

    const nextQ = await db.query(
      `SELECT lesson_id, title
       FROM lessons
       WHERE course_id = $1 AND lesson_order > $2
       ORDER BY lesson_order ASC
       LIMIT 1`,
      [lesson.course_id, lesson.lesson_order]
    );

    return res.json({
      ...lesson,
      previous_lesson: prevQ.rows[0] || null,
      next_lesson: nextQ.rows[0] || null
    });
  } catch (e) {
    console.error('GET /lessons/:lessonId error:', e);
    return res.status(500).json({ error: 'Ошибка получения урока' });
  }
});

// Проверка кода для урока
router.post('/:lessonId/check', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const lessonId = Number(req.params.lessonId);
    const { code } = req.body;

    if (!lessonId) {
      return res.status(400).json({
        success: false,
        error: 'Некорректный lessonId'
      });
    }

    if (!code || !code.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Код пустой'
      });
    }

    const lessonQ = await db.query(
      `SELECT lesson_id, course_id, title
       FROM lessons
       WHERE lesson_id = $1`,
      [lessonId]
    );

    if (!lessonQ.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Урок не найден'
      });
    }

    const lesson = lessonQ.rows[0];

    const enrolled = await hasEnrollment(userId, lesson.course_id);
    if (!enrolled) {
      return res.status(403).json({
        success: false,
        error: 'Сначала запишитесь на курс'
      });
    }

    const testsQ = await db.query(
      `SELECT test_case_id, stdin_text, expected_stdout, test_order
       FROM lesson_test_cases
       WHERE lesson_id = $1
       ORDER BY test_order ASC, test_case_id ASC`,
      [lessonId]
    );

    const tests = testsQ.rows;

    if (!tests.length) {
      return res.status(400).json({
        success: false,
        error: 'Для этого урока ещё не добавлены тесты'
      });
    }

    for (let i = 0; i < tests.length; i += 1) {
      const test = tests[i];
      let result;

      try {
        result = await runUserPython(code, test.stdin_text || '');
      } catch (err) {
        await setPracticePassed(userId, lessonId, false);

        if (err.message === 'TIMEOUT') {
          return res.json({
            success: false,
            message: 'Превышено время выполнения. Возможно, в коде бесконечный цикл.'
          });
        }

        return res.json({
          success: false,
          message: 'Не удалось запустить код',
          error: err.message
        });
      }

      if (result.code !== 0) {
        await setPracticePassed(userId, lessonId, false);

        return res.json({
          success: false,
          message: `Ошибка выполнения на тесте ${i + 1}`,
          error: result.stderr || 'Программа завершилась с ошибкой'
        });
      }

      const actual = normalizeOutput(result.stdout);
      const expected = normalizeOutput(test.expected_stdout);

      if (actual !== expected) {
        await setPracticePassed(userId, lessonId, false);

        return res.json({
          success: false,
          message: `Неверный ответ на тесте ${i + 1}`,
          expected,
          actual
        });
      }
    }

    await setPracticePassed(userId, lessonId, true);

    return res.json({
      success: true,
      message: 'Все тесты пройдены верно'
    });
  } catch (e) {
    console.error('POST /lessons/:lessonId/check error:', e);
    return res.status(500).json({
      success: false,
      error: 'Ошибка проверки кода'
    });
  }
});

// Отметить урок как выполненный
router.patch('/:lessonId/complete', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const lessonId = Number(req.params.lessonId);

    if (!lessonId) {
      return res.status(400).json({ error: 'Некорректный lessonId' });
    }

    const lessonQ = await db.query(
      `SELECT lesson_id, course_id
       FROM lessons
       WHERE lesson_id = $1`,
      [lessonId]
    );

    if (!lessonQ.rows.length) {
      return res.status(404).json({ error: 'Урок не найден' });
    }

    const lesson = lessonQ.rows[0];

    const enrolled = await hasEnrollment(userId, lesson.course_id);
    if (!enrolled) {
      return res.status(403).json({ error: 'Сначала запишитесь на курс' });
    }

    const testCountQ = await db.query(
      `SELECT COUNT(*)::int AS test_count
       FROM lesson_test_cases
       WHERE lesson_id = $1`,
      [lessonId]
    );

    const testCount = Number(testCountQ.rows[0].test_count || 0);

    if (testCount > 0) {
      const progressQ = await db.query(
        `SELECT COALESCE(practice_passed, FALSE) AS practice_passed,
                COALESCE(is_completed, FALSE) AS is_completed
         FROM lesson_progress
         WHERE user_id = $1 AND lesson_id = $2`,
        [userId, lessonId]
      );

      const practicePassed =
        progressQ.rows.length > 0 && progressQ.rows[0].practice_passed === true;

      if (!practicePassed) {
        return res.status(400).json({
          error: 'Сначала успешно пройдите проверку кода'
        });
      }
    }

    const existingProgressQ = await db.query(
      `SELECT COALESCE(is_completed, FALSE) AS is_completed
       FROM lesson_progress
       WHERE user_id = $1 AND lesson_id = $2`,
      [userId, lessonId]
    );

    const wasCompleted =
      existingProgressQ.rows.length > 0 && existingProgressQ.rows[0].is_completed === true;

    const result = await db.query(
      `INSERT INTO lesson_progress (
         user_id,
         lesson_id,
         is_completed,
         completed_at,
         practice_passed,
         practice_passed_at
       )
       VALUES (
         $1,
         $2,
         TRUE,
         CURRENT_TIMESTAMP,
         TRUE,
         CURRENT_TIMESTAMP
       )
       ON CONFLICT (user_id, lesson_id)
       DO UPDATE SET
         is_completed = TRUE,
         completed_at = CURRENT_TIMESTAMP,
         practice_passed = TRUE,
         practice_passed_at = COALESCE(lesson_progress.practice_passed_at, CURRENT_TIMESTAMP)
       RETURNING progress_id, is_completed, completed_at, practice_passed, practice_passed_at`,
      [userId, lessonId]
    );

    let gamification = null;

    if (!wasCompleted) {
      gamification = await handleLessonCompletionGamification(
        userId,
        lessonId,
        lesson.course_id
      );
    }

    return res.json({
      success: true,
      progress: result.rows[0],
      gamification
    });
  } catch (e) {
    console.error('PATCH /lessons/:lessonId/complete error:', e);
    return res.status(500).json({ error: 'Ошибка отметки урока' });
  }
});

// Прогресс по курсу
router.get('/progress/:courseId', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const courseId = Number(req.params.courseId);

    if (!courseId) {
      return res.status(400).json({ error: 'Некорректный courseId' });
    }

    const enrolled = await hasEnrollment(userId, courseId);
    if (!enrolled) {
      return res.status(403).json({ error: 'Сначала запишитесь на курс' });
    }

    const q = await db.query(
      `SELECT
         COUNT(l.lesson_id) AS total_lessons,
         COUNT(lp.lesson_id) FILTER (WHERE lp.is_completed = TRUE) AS completed_lessons
       FROM lessons l
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id = l.lesson_id
        AND lp.user_id = $2
       WHERE l.course_id = $1`,
      [courseId, userId]
    );

    const total = Number(q.rows[0].total_lessons || 0);
    const completed = Number(q.rows[0].completed_lessons || 0);

    return res.json({
      course_id: courseId,
      total_lessons: total,
      completed_lessons: completed,
      progress_percent: total > 0 ? Math.round((completed / total) * 100) : 0
    });
  } catch (e) {
    console.error('GET /lessons/progress/:courseId error:', e);
    return res.status(500).json({ error: 'Ошибка получения прогресса' });
  }
});

export default router;