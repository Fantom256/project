import jwt from 'jsonwebtoken';

export default function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Нет токена' });

  const token = h.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { user_id, role, iat, exp }
    next();
  } catch {
    return res.status(401).json({ error: 'Неверный токен' });
  }
}
