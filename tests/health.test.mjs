import request from 'supertest';
import app from '../src/app.js';

describe('GET /api/health', () => {
  it('returns status 200 and JSON', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status');
  });
});
