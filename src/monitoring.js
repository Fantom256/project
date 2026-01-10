import client from 'prom-client';

export const register = new client.Registry();

// стандартные метрики Node.js (CPU/memory/event loop)
client.collectDefaultMetrics({ register });

// метрика запросов
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.7, 1.5, 3, 7] // секунды
});

register.registerMetric(httpRequestDuration);

// middleware для измерения времени запросов
export function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const seconds = Number(end - start) / 1e9;

    // маршрут может быть undefined, используем path
    const route =
      (req.route && req.route.path) ||
      (req.baseUrl ? req.baseUrl + (req.path || '') : req.path) ||
      'unknown';

    httpRequestDuration
      .labels(req.method, route, String(res.statusCode))
      .observe(seconds);
  });

  next();
}
