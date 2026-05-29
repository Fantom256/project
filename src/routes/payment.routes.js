import { Router } from 'express';
import crypto from 'crypto';
import db from '../config/db.js';
import auth from '../middleware/auth.js';

const router = Router();

function getYooKassaAuthHeader() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  if (!shopId || !secretKey) {
    throw new Error('Не заданы YOOKASSA_SHOP_ID или YOOKASSA_SECRET_KEY');
  }

  return 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');
}

async function updatePaymentAndEnrollment({
  yookassaPaymentId,
  status,
  rawResponse,
  paidAt = null
}) {
  const paymentRes = await db.query(
    `
    UPDATE payments
    SET
      status = $2,
      raw_response = $3,
      updated_at = CURRENT_TIMESTAMP,
      paid_at = COALESCE($4, paid_at)
    WHERE yookassa_payment_id = $1
    RETURNING payment_id, enrollment_id
    `,
    [yookassaPaymentId, status, rawResponse, paidAt]
  );

  if (!paymentRes.rows.length) {
    return null;
  }

  const enrollmentId = paymentRes.rows[0].enrollment_id;

  if (status === 'succeeded') {
    await db.query(
      `
      UPDATE enrollments
      SET
        payment_status = 'paid',
        payment_date = CURRENT_TIMESTAMP
      WHERE enrollment_id = $1
      `,
      [enrollmentId]
    );
  } else if (status === 'canceled') {
    await db.query(
      `
      UPDATE enrollments
      SET payment_status = 'canceled'
      WHERE enrollment_id = $1
      `,
      [enrollmentId]
    );
  }

  return paymentRes.rows[0];
}

/**
 * Получить оплаты текущего пользователя
 */
router.get('/my', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await db.query(
      `
      SELECT
        e.enrollment_id,
        e.payment_status,
        e.payment_date,
        c.title AS course_title,
        c.price,
        p.payment_id,
        p.status AS provider_payment_status,
        p.yookassa_payment_id,
        p.confirmation_url,
        p.created_at AS payment_created_at,
        p.paid_at
      FROM enrollments e
      JOIN courses c
        ON c.course_id = e.course_id
      LEFT JOIN LATERAL (
        SELECT
          payment_id,
          status,
          yookassa_payment_id,
          confirmation_url,
          created_at,
          paid_at
        FROM payments
        WHERE enrollment_id = e.enrollment_id
        ORDER BY payment_id DESC
        LIMIT 1
      ) p ON TRUE
      WHERE e.user_id = $1
      ORDER BY e.enrolled_at DESC
      `,
      [userId]
    );

    res.json(result.rows);
  } catch (e) {
    console.error('GET /payments/my error:', e);
    res.status(500).json({ error: 'Ошибка получения оплат' });
  }
});

/**
 * Создать платеж в YooKassa
 */
router.post('/create', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const enrollmentId = Number(req.body.enrollment_id);

    if (!enrollmentId) {
      return res.status(400).json({ error: 'Некорректный enrollment_id' });
    }

    const enrollmentQ = await db.query(
      `
      SELECT
        e.enrollment_id,
        e.user_id,
        e.course_id,
        e.payment_status,
        c.title AS course_title,
        c.price
      FROM enrollments e
      JOIN courses c ON c.course_id = e.course_id
      WHERE e.enrollment_id = $1
        AND e.user_id = $2
      LIMIT 1
      `,
      [enrollmentId, userId]
    );

    if (!enrollmentQ.rows.length) {
      return res.status(404).json({ error: 'Запись на курс не найдена' });
    }

    const enrollment = enrollmentQ.rows[0];

    if (String(enrollment.payment_status || '').toLowerCase() === 'paid') {
      return res.status(400).json({ error: 'Курс уже оплачен' });
    }

    const amount = Number(enrollment.price || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Некорректная сумма оплаты' });
    }

    const idempotenceKey = crypto.randomUUID();
    const returnUrl =
      process.env.YOOKASSA_RETURN_URL || 'http://localhost:3000/payment-success.html';

    const ykRes = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotenceKey,
        Authorization: getYooKassaAuthHeader()
      },
      body: JSON.stringify({
        amount: {
          value: amount.toFixed(2),
          currency: 'RUB'
        },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: returnUrl
        },
        description: `Оплата курса: ${enrollment.course_title}`,
        metadata: {
          enrollment_id: String(enrollment.enrollment_id),
          user_id: String(enrollment.user_id),
          course_id: String(enrollment.course_id)
        }
      })
    });

    const paymentData = await ykRes.json().catch(() => ({}));

    if (!ykRes.ok) {
      return res.status(400).json({
        error: paymentData.description || 'Ошибка создания платежа YooKassa',
        details: paymentData
      });
    }

    await db.query(
      `
      INSERT INTO payments (
        enrollment_id,
        user_id,
        provider,
        amount,
        currency,
        status,
        yookassa_payment_id,
        idempotence_key,
        confirmation_url,
        description,
        is_test,
        raw_response
      )
      VALUES (
        $1, $2, 'yookassa', $3, $4, $5,
        $6, $7, $8, $9, $10, $11
      )
      `,
      [
        enrollment.enrollment_id,
        enrollment.user_id,
        amount,
        paymentData.amount?.currency || 'RUB',
        paymentData.status || 'pending',
        paymentData.id,
        idempotenceKey,
        paymentData.confirmation?.confirmation_url || null,
        paymentData.description || `Оплата курса: ${enrollment.course_title}`,
        Boolean(paymentData.test),
        paymentData
      ]
    );

    if (
      String(enrollment.payment_status || '').toLowerCase() !== 'paid' &&
      String(enrollment.payment_status || '').toLowerCase() !== 'canceled'
    ) {
      await db.query(
        `
        UPDATE enrollments
        SET payment_status = 'pending'
        WHERE enrollment_id = $1
        `,
        [enrollment.enrollment_id]
      );
    }

    res.json({
      success: true,
      payment_id: paymentData.id,
      status: paymentData.status,
      confirmation_url: paymentData.confirmation?.confirmation_url || null,
      test: Boolean(paymentData.test)
    });
  } catch (e) {
    console.error('POST /payments/create error:', e);
    res.status(500).json({ error: 'Ошибка создания платежа' });
  }
});

/**
 * Webhook от YooKassa
 */
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body?.event;
    const object = req.body?.object;

    if (!event || !object?.id) {
      return res.sendStatus(400);
    }

    const yookassaPaymentId = object.id;
    const status = object.status;
    const paidAt =
      event === 'payment.succeeded' ? new Date() : null;

    if (event === 'payment.succeeded' || event === 'payment.canceled') {
      await updatePaymentAndEnrollment({
        yookassaPaymentId,
        status,
        rawResponse: req.body,
        paidAt
      });
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('POST /payments/webhook error:', e);
    res.sendStatus(500);
  }
});

router.post('/check', auth, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const paymentId = String(req.body.payment_id || '').trim();

    console.log('[payments/check] userId =', userId, 'paymentId =', paymentId);

    if (!paymentId) {
      return res.status(400).json({ error: 'Не передан payment_id' });
    }

    const localPaymentQ = await db.query(
      `
      SELECT
        payment_id,
        enrollment_id,
        user_id,
        yookassa_payment_id,
        status
      FROM payments
      WHERE yookassa_payment_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [paymentId, userId]
    );

    console.log('[payments/check] local payment rows =', localPaymentQ.rows.length);

    if (!localPaymentQ.rows.length) {
      return res.status(404).json({ error: 'Платёж не найден в таблице payments' });
    }

    const authHeader = getYooKassaAuthHeader();

    const ykRes = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        Authorization: authHeader
      }
    });

    const rawText = await ykRes.text();

    let paymentData = {};
    try {
      paymentData = JSON.parse(rawText);
    } catch {
      paymentData = { raw: rawText };
    }

    console.log('[payments/check] yookassa status =', ykRes.status);
    console.log('[payments/check] yookassa body =', paymentData);

    if (!ykRes.ok) {
      return res.status(400).json({
        error: paymentData.description || 'Не удалось получить статус платежа из YooKassa',
        details: paymentData
      });
    }

    const status = String(paymentData.status || '').toLowerCase();
    const enrollmentId = localPaymentQ.rows[0].enrollment_id;

    await db.query(
      `
      UPDATE payments
      SET
        status = $2::varchar(30),
        raw_response = $3::jsonb,
        updated_at = CURRENT_TIMESTAMP,
        paid_at = CASE
          WHEN $2::text = 'succeeded' THEN CURRENT_TIMESTAMP
          ELSE paid_at
        END
      WHERE yookassa_payment_id = $1
      `,
      [paymentId, status, JSON.stringify(paymentData)]
    );

    if (status === 'succeeded') {
      await db.query(
        `
        UPDATE enrollments
        SET
          payment_status = 'paid',
          payment_date = CURRENT_TIMESTAMP
        WHERE enrollment_id = $1
          AND user_id = $2
        `,
        [enrollmentId, userId]
      );
    } else if (status === 'canceled') {
      await db.query(
        `
        UPDATE enrollments
        SET payment_status = 'canceled'
        WHERE enrollment_id = $1
          AND user_id = $2
        `,
        [enrollmentId, userId]
      );
    } else {
      await db.query(
        `
        UPDATE enrollments
        SET payment_status = 'pending'
        WHERE enrollment_id = $1
          AND user_id = $2
        `,
        [enrollmentId, userId]
      );
    }

    res.json({
      success: true,
      payment_id: paymentId,
      status
    });
  } catch (e) {
    console.error('POST /payments/check error:', e);
    res.status(500).json({
      error: e.message || 'Ошибка проверки статуса платежа'
    });
  }
});

export default router;