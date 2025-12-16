import pool from '../config/db.js';

export async function getAllCourses() {
  const { rows } = await pool.query(`
    SELECT
      course_id,
      title,
      description,
      price,
      duration_months,
      image_url,
      created_at
    FROM courses
    WHERE is_published = true
    ORDER BY created_at DESC
  `);

  return rows;
}

export async function getCourseById(id) {
  const { rows } = await pool.query(`
    SELECT
      course_id,
      title,
      description,
      price,
      duration_months,
      image_url,
      created_at
    FROM courses
    WHERE course_id = $1 AND is_published = true
  `, [id]);

  return rows[0];
}