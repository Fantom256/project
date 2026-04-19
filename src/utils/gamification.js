import db from '../config/db.js';

const LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];

export function getLevelByXp(xp) {
  let level = 1;

  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    }
  }

  return level;
}

export function getLevelProgress(xp) {
  const level = getLevelByXp(xp);
  const currentMin = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nextMin = LEVEL_THRESHOLDS[level] ?? currentMin + 500;

  const currentXp = xp - currentMin;
  const neededXp = nextMin - currentMin;
  const percent = neededXp > 0
    ? Math.max(0, Math.min(100, Math.round((currentXp / neededXp) * 100)))
    : 100;

  return {
    level,
    current_xp_in_level: currentXp,
    needed_xp_in_level: neededXp,
    current_level_total_xp: currentMin,
    next_level_total_xp: nextMin,
    percent
  };
}

export async function ensureUserGameStats(userId) {
  await db.query(
    `INSERT INTO user_game_stats (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  const q = await db.query(
    `SELECT user_id, xp, streak_days, best_streak, last_activity_date
     FROM user_game_stats
     WHERE user_id = $1`,
    [userId]
  );

  return q.rows[0];
}

export async function addXpIfNotExists(userId, sourceType, sourceId, xpDelta, description) {
  await ensureUserGameStats(userId);

  const insertLogQ = await db.query(
    `INSERT INTO user_xp_log (user_id, source_type, source_id, xp_delta, description)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING xp_log_id`,
    [userId, sourceType, sourceId, xpDelta, description]
  );

  if (!insertLogQ.rows.length) {
    return false;
  }

  await db.query(
    `UPDATE user_game_stats
     SET xp = xp + $2
     WHERE user_id = $1`,
    [userId, xpDelta]
  );

  return true;
}

export async function updateDailyStreak(userId) {
  await ensureUserGameStats(userId);

  const q = await db.query(
    `UPDATE user_game_stats
     SET
       streak_days = CASE
         WHEN last_activity_date = CURRENT_DATE THEN streak_days
         WHEN last_activity_date = CURRENT_DATE - 1 THEN streak_days + 1
         ELSE 1
       END,
       best_streak = GREATEST(
         best_streak,
         CASE
           WHEN last_activity_date = CURRENT_DATE THEN streak_days
           WHEN last_activity_date = CURRENT_DATE - 1 THEN streak_days + 1
           ELSE 1
         END
       ),
       last_activity_date = CURRENT_DATE
     WHERE user_id = $1
     RETURNING user_id, streak_days, best_streak, last_activity_date`,
    [userId]
  );

  return {
    streak_days: Number(q.rows[0].streak_days || 0),
    best_streak: Number(q.rows[0].best_streak || 0),
    last_activity_date: q.rows[0].last_activity_date,
    changed: true
  };
}

export async function grantAchievementByCode(userId, code) {
  const achQ = await db.query(
    `SELECT achievement_id, code, title, description, icon, xp_reward
     FROM achievements
     WHERE code = $1 AND is_active = TRUE
     LIMIT 1`,
    [code]
  );

  if (!achQ.rows.length) {
    return null;
  }

  const achievement = achQ.rows[0];

  const insertQ = await db.query(
    `INSERT INTO user_achievements (user_id, achievement_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, achievement_id) DO NOTHING
     RETURNING achievement_id, unlocked_at`,
    [userId, achievement.achievement_id]
  );

  if (!insertQ.rows.length) {
    return null;
  }

  if (Number(achievement.xp_reward) > 0) {
    await addXpIfNotExists(
      userId,
      'achievement',
      achievement.achievement_id,
      Number(achievement.xp_reward),
      `Достижение: ${achievement.title}`
    );
  }

  return {
    ...achievement,
    unlocked_at: insertQ.rows[0].unlocked_at
  };
}

export async function getCompletedLessonsCount(userId) {
  const q = await db.query(
    `SELECT COUNT(*)::int AS completed_lessons
     FROM lesson_progress
     WHERE user_id = $1
       AND is_completed = TRUE`,
    [userId]
  );

  return Number(q.rows[0].completed_lessons || 0);
}

export async function isCourseCompleted(userId, courseId) {
  const q = await db.query(
    `SELECT
       COUNT(l.lesson_id)::int AS total_lessons,
       COUNT(lp.lesson_id) FILTER (WHERE lp.is_completed = TRUE)::int AS completed_lessons
     FROM lessons l
     LEFT JOIN lesson_progress lp
       ON lp.lesson_id = l.lesson_id
      AND lp.user_id = $2
     WHERE l.course_id = $1`,
    [courseId, userId]
  );

  const total = Number(q.rows[0].total_lessons || 0);
  const completed = Number(q.rows[0].completed_lessons || 0);

  return total > 0 && total === completed;
}

export async function getCompletedCoursesCount(userId) {
  const q = await db.query(
    `SELECT COUNT(*)::int AS completed_courses
     FROM (
       SELECT l.course_id
       FROM lessons l
       LEFT JOIN lesson_progress lp
         ON lp.lesson_id = l.lesson_id
        AND lp.user_id = $1
       GROUP BY l.course_id
       HAVING COUNT(l.lesson_id) > 0
          AND COUNT(lp.lesson_id) FILTER (WHERE lp.is_completed = TRUE) = COUNT(l.lesson_id)
     ) t`,
    [userId]
  );

  return Number(q.rows[0].completed_courses || 0);
}

export async function getUserGamificationSummary(userId) {
  const stats = await ensureUserGameStats(userId);

  const achievementsQ = await db.query(
    `SELECT
       a.achievement_id,
       a.code,
       a.title,
       a.description,
       a.icon,
       a.xp_reward,
       ua.unlocked_at
     FROM user_achievements ua
     JOIN achievements a
       ON a.achievement_id = ua.achievement_id
     WHERE ua.user_id = $1
     ORDER BY ua.unlocked_at DESC`,
    [userId]
  );

  const xp = Number(stats.xp || 0);

  return {
    xp,
    level: getLevelByXp(xp),
    level_progress: getLevelProgress(xp),
    streak_days: Number(stats.streak_days || 0),
    best_streak: Number(stats.best_streak || 0),
    last_activity_date: stats.last_activity_date,
    achievements: achievementsQ.rows
  };
}

export async function getCourseGamificationSummary(userId, courseId) {
  const lessonsQ = await db.query(
    `SELECT
       l.lesson_id,
       l.title,
       l.lesson_order,
       COALESCE(lp.is_completed, FALSE) AS is_completed
     FROM lessons l
     LEFT JOIN lesson_progress lp
       ON lp.lesson_id = l.lesson_id
      AND lp.user_id = $2
     WHERE l.course_id = $1
     ORDER BY l.lesson_order`,
    [courseId, userId]
  );

  const lessons = lessonsQ.rows;
  const totalLessons = lessons.length;
  const completedLessons = lessons.filter((l) => l.is_completed).length;
  const progressPercent = totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0;

  let foundCurrent = false;

  const progressMap = lessons.map((lesson) => {
    let state = 'locked';

    if (lesson.is_completed) {
      state = 'completed';
    } else if (!foundCurrent) {
      state = 'current';
      foundCurrent = true;
    }

    return {
      lesson_id: lesson.lesson_id,
      title: lesson.title,
      lesson_order: lesson.lesson_order,
      is_completed: lesson.is_completed,
      state
    };
  });

  return {
    course_id: courseId,
    total_lessons: totalLessons,
    completed_lessons: completedLessons,
    progress_percent: progressPercent,
    progress_map: progressMap
  };
}

export async function handleLessonCompletionGamification(userId, lessonId, courseId) {
  await ensureUserGameStats(userId);

  let xpEarned = 0;
  const unlockedAchievements = [];

  await updateDailyStreak(userId);

  const lessonXpAdded = await addXpIfNotExists(
    userId,
    'lesson_complete',
    lessonId,
    10,
    'Завершение урока'
  );

  if (lessonXpAdded) {
    xpEarned += 10;
  }

  const completedLessons = await getCompletedLessonsCount(userId);

  if (completedLessons >= 1) {
    const ach = await grantAchievementByCode(userId, 'first_lesson');
    if (ach) {
      unlockedAchievements.push(ach);
      xpEarned += Number(ach.xp_reward || 0);
    }
  }

  if (completedLessons >= 5) {
    const ach = await grantAchievementByCode(userId, 'five_lessons');
    if (ach) {
      unlockedAchievements.push(ach);
      xpEarned += Number(ach.xp_reward || 0);
    }
  }

  const courseCompleted = await isCourseCompleted(userId, courseId);

  if (courseCompleted) {
    const courseXpAdded = await addXpIfNotExists(
      userId,
      'course_complete',
      courseId,
      50,
      'Завершение курса'
    );

    if (courseXpAdded) {
      xpEarned += 50;
    }

    const completedCourses = await getCompletedCoursesCount(userId);

    if (completedCourses >= 1) {
      const ach = await grantAchievementByCode(userId, 'first_course');
      if (ach) {
        unlockedAchievements.push(ach);
        xpEarned += Number(ach.xp_reward || 0);
      }
    }

    if (Number(courseId) === 1) {
      const ach = await grantAchievementByCode(userId, 'python_course');
      if (ach) {
        unlockedAchievements.push(ach);
        xpEarned += Number(ach.xp_reward || 0);
      }
    }
  }

  const finalStats = await ensureUserGameStats(userId);
  const streakDays = Number(finalStats.streak_days || 0);

  if (streakDays >= 3) {
    const ach = await grantAchievementByCode(userId, 'streak_3');
    if (ach) {
      unlockedAchievements.push(ach);
      xpEarned += Number(ach.xp_reward || 0);
    }
  }

  if (streakDays >= 7) {
    const ach = await grantAchievementByCode(userId, 'streak_7');
    if (ach) {
      unlockedAchievements.push(ach);
      xpEarned += Number(ach.xp_reward || 0);
    }
  }

  const xp = Number(finalStats.xp || 0);

  return {
    xp_earned: xpEarned,
    xp,
    level: getLevelByXp(xp),
    level_progress: getLevelProgress(xp),
    streak_days: Number(finalStats.streak_days || 0),
    best_streak: Number(finalStats.best_streak || 0),
    unlocked_achievements: unlockedAchievements,
    course_completed: courseCompleted
  };
}