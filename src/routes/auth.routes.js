import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';

const router = Router();

function signToken(payload) {
  console.log('JWT_SECRET =', process.env.JWT_SECRET);  
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { full_name, email, password } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }

  try {
    const exists = await db.query('SELECT 1 FROM users WHERE email=$1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email уже используется' });

    // роль "student"
    const roleRes = await db.query('SELECT role_id FROM roles WHERE name=$1', ['student']);
    if (!roleRes.rows.length) {
      return res.status(500).json({ error: 'В таблице roles нет роли student' });
    }
    const role_id = roleRes.rows[0].role_id;

    const password_hash = await bcrypt.hash(password, 10);

    const ins = await db.query(
      `INSERT INTO users (full_name, email, password_hash, role_id)
       VALUES ($1,$2,$3,$4)
       RETURNING user_id, full_name`,
      [full_name, email, password_hash, role_id]
    );

    const user = ins.rows[0];
    const token = signToken({ user_id: user.user_id, role: 'student' });

    return res.status(201).json({
      token,
      user_id: user.user_id,
      full_name: user.full_name,
      role: 'student'
    });
  } catch (e) {
    console.error('register error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Введите email и пароль' });

  try {
    const q = await db.query(
      `SELECT u.user_id, u.full_name, u.password_hash, r.name AS role
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.email = $1`,
      [email]
    );

    if (!q.rows.length) return res.status(401).json({ error: 'Неверный email или пароль' });

    const user = q.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Неверный email или пароль' });

    const token = signToken({ user_id: user.user_id, role: user.role });

    res.json({
      token,
      user_id: user.user_id,
      full_name: user.full_name,
      role: user.role
    });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
