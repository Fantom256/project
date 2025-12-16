import { Router } from 'express';
import db from '../config/db.js';

const router = Router();

/* 1) Все курсы */
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT *
      FROM courses
      WHERE is_published = TRUE
      ORDER BY course_id
    `);
    res.json(result.rows);
  } catch (e) {
    console.error('Ошибка /api/courses:', e);
    res.status(500).json({ error: 'Ошибка получения курсов' });
  }
});

/* 2) ✅ Курсы по категориям (для фронта) */
router.get('/by-category', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        c.course_id,
        c.title,
        c.description,
        c.price,
        c.duration_months,
        c.image_url,
        COALESCE(cat.name, 'Без категории') AS category_name
      FROM courses c
      LEFT JOIN categories cat ON c.category_id = cat.category_id
      WHERE c.is_published = TRUE
      ORDER BY category_name, c.title
    `);

    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.category_name]) grouped[row.category_name] = [];
      grouped[row.category_name].push(row);
    }

    res.json(grouped);
  } catch (e) {
    console.error('Ошибка /api/courses/by-category:', e);
    res.status(500).json({ error: 'Ошибка получения курсов по категориям' });
  }
});

export default router;