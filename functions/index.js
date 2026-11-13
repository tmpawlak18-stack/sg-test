const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
setGlobalOptions({ region: 'europe-central2', maxInstances: 5 });

const db = admin.firestore();
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const ADMIN_EMAIL = 'testrekrut.pl@gmail.com';
const PRICE_GROSZ = 4999;

// Na pierwszym etapie sprzedaż jest celowo ograniczona wyłącznie do SG.
// Pozostałe formacje można dodać dopiero po audycie ich mechanizmów aktywacji.
const PRODUCTS = {
  sg: { label: 'Straż Graniczna', slug: 'straz-graniczna' }
};

function requireAdmin(request) {
  const email = request.auth?.token?.email;
  const verified = request.auth?.token?.email_verified === true;

  if (!request.auth || email !== ADMIN_EMAIL || !verified) {
    throw new HttpsError('permission-denied', 'Brak uprawnień administratora.');
  }
}

function validEmail(value) {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validOrderId(value) {
  // Firestore auto-ID ma 20 znaków. Odrzucamy ścieżki i nietypowe identyfikatory.
  return typeof value === 'string' && /^[A-Za-z0-9_-]{10,40}$/.test(value);
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }
  return code;
}

function orderNumber(seq, year) {
  return `TR-${year}-${String(seq).padStart(5, '0')}`;
}

async function sendAccessEmail({ to, code, product, orderNo }, apiKey) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'TESTREKRUT <dostep@testrekrut.pl>',
      to: [to],
      subject: `Twój kod dostępu TESTREKRUT — ${product.label}`,
      text: `Dziękujemy za zakup w TESTREKRUT.\n\nFormacja: ${product.label}\nNumer zamówienia: ${orderNo}\nKod dostępu: ${code}\n\nWejdź na https://testrekrut.pl/${product.slug}/ i aktywuj kod w sekcji aktywacji dostępu.\n\nWiadomość wygenerowana automatycznie.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h2>TESTREKRUT</h2><p>Dziękujemy za zakup.</p><p>Formacja: <b>${product.label}</b><br>Numer zamówienia: <b>${orderNo}</b></p><div style="padding:20px;background:#eef4fb;border-radius:12px;text-align:center"><div style="font-size:12px;color:#526078">TWÓJ KOD DOSTĘPU</div><div style="font-size:28px;font-weight:bold;letter-spacing:3px;margin-top:8px">${code}</div></div><p>Wejdź na <a href="https://testrekrut.pl/${product.slug}/">stronę testu ${product.label}</a> i aktywuj kod.</p><p style="font-size:12px;color:#687386">Wiadomość wygenerowana automatycznie przez TESTREKRUT.</p></div>`
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // Szczegóły błędu nie są zwracane klientowi ani zapisywane w dokumencie zamówienia.
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 300)}`);
  }

  return response.json();
}

async function deliverOrderEmail(orderRef, order, code, apiKey) {
  try {
    const mail = await sendAccessEmail({
      to: order.email,
      code,
      product: PRODUCTS[order.product],
      orderNo: order.number
    }, apiKey);

    await orderRef.update({
      emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      emailStatus: 'sent',
      resendMessageId: mail.id || null,
      emailLastError: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return mail;
  } catch (error) {
    // Kod i status opłacenia pozostają zapisane. Administrator może ponowić wysyłkę
    // funkcją resendAccessEmail; nie powstanie drugi kod.
    await orderRef.update({
      emailStatus: 'failed',
      emailLastError: 'Nie udało się wysłać wiadomości. Użyj ponownej wysyłki.',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});

    throw new HttpsError(
      'unavailable',
      'Płatność została zapisana i kod wygenerowany, ale e-mail nie został wysłany. Użyj ponownej wysyłki kodu w panelu administratora.'
    );
  }
}

exports.createOrder = onCall(
  {
    maxInstances: 5,
    // App Check pozostaje wyłączony do czasu skonfigurowania go również w kliencie.
    // Włączenie go tylko po stronie funkcji zablokowałoby obecny formularz zamówienia.
    enforceAppCheck: false
  },
  async (request) => {
    const email = String(request.data?.email || '').trim().toLowerCase();
    const productKey = String(request.data?.product || '');

    if (!validEmail(email)) {
      throw new HttpsError('invalid-argument', 'Podaj prawidłowy adres e-mail.');
    }
    if (productKey !== 'sg') {
      throw new HttpsError('invalid-argument', 'Na tym etapie dostępna jest wyłącznie Straż Graniczna.');
    }

    // Limit: maksymalnie 5 zamówień z jednego IP w ciągu 15 minut.
    const ip = String(request.rawRequest?.ip || 'unknown').slice(0, 80);
    const now = Date.now();
    const rateRef = db.collection('_orderRateLimits')
      .doc(crypto.createHash('sha256').update(ip).digest('hex'));

    const year = new Date().getUTCFullYear();
    const counterRef = db.collection('_counters').doc(`orders-${year}`);
    const orderRef = db.collection('orders').doc();

    const result = await db.runTransaction(async (tx) => {
      const [rateSnap, counterSnap] = await Promise.all([
        tx.get(rateRef),
        tx.get(counterRef)
      ]);

      const rate = rateSnap.exists ? rateSnap.data() : {};
      const windowStart = Number(rate.windowStart || 0);
      const count = windowStart && now - windowStart < 15 * 60 * 1000
        ? Number(rate.count || 0)
        : 0;

      if (count >= 5) {
        throw new HttpsError(
          'resource-exhausted',
          'Zbyt wiele prób. Spróbuj ponownie za 15 minut.'
        );
      }

      const nextCount = count + 1;
      tx.set(rateRef, {
        windowStart: count ? windowStart : now,
        count: nextCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Pole pomocnicze; automatyczne usuwanie wymaga osobnego włączenia TTL w Firestore.
        expiresAt: admin.firestore.Timestamp.fromMillis(now + 24 * 60 * 60 * 1000)
      });

      const seq = Number(counterSnap.data()?.value || 0) + 1;
      tx.set(counterRef, {
        value: seq,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      const number = orderNumber(seq, year);
      tx.create(orderRef, {
        number,
        email,
        product: productKey,
        productLabel: PRODUCTS[productKey].label,
        amountGrosz: PRICE_GROSZ,
        currency: 'PLN',
        status: 'pending',
        paymentMethod: 'BLIK',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        codeId: null,
        emailSentAt: null,
        emailStatus: 'not_sent'
      });

      return {
        orderId: orderRef.id,
        number,
        amount: '49,99 zł',
        paymentTitle: number,
        productLabel: PRODUCTS[productKey].label
      };
    });

    return result;
  }
);

exports.listOrders = onCall(async (request) => {
  requireAdmin(request);

  const status = String(request.data?.status || 'all');
  const allowedStatuses = new Set(['all', 'pending', 'paid']);
  if (!allowedStatuses.has(status)) {
    throw new HttpsError('invalid-argument', 'Nieprawidłowy filtr zamówień.');
  }

  const requestedLimit = Number(request.data?.limit || 100);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1), 200);

  let query = db.collection('orders').orderBy('createdAt', 'desc').limit(limit);
  if (status !== 'all') {
    query = db.collection('orders')
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(limit);
  }

  const snap = await query.get();
  return {
    orders: snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.().toISOString() || null,
      paidAt: doc.data().paidAt?.toDate?.().toISOString() || null
    }))
  };
});

exports.getDashboard = onCall(async (request) => {
  requireAdmin(request);

  // Uwaga: obecna wersja liczy wszystkie dokumenty zamówień.
  // Przy większej skali warto przejść na agregacje/liczniki utrzymywane transakcyjnie.
  const snap = await db.collection('orders').get();
  const all = snap.docs.map((doc) => doc.data());
  const paid = all.filter((order) => order.status === 'paid');

  return {
    total: all.length,
    pending: all.filter((order) => order.status === 'pending').length,
    paid: paid.length,
    revenueGrosz: paid.reduce((sum, order) => sum + Number(order.amountGrosz || 0), 0)
  };
});

exports.confirmPayment = onCall(
  { secrets: [RESEND_API_KEY] },
  async (request) => {
    requireAdmin(request);

    const orderId = String(request.data?.orderId || '');
    if (!validOrderId(orderId)) {
      throw new HttpsError('invalid-argument', 'Nieprawidłowy identyfikator zamówienia.');
    }

    const orderRef = db.collection('orders').doc(orderId);
    let payload;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Nie znaleziono zamówienia.');
      }

      const order = snap.data();

      if (order.status === 'paid' && order.codeId) {
        const codeRef = db.collection('accessCodes').doc(order.codeId);
        const codeSnap = await tx.get(codeRef);
        if (!codeSnap.exists) {
          throw new HttpsError(
            'data-loss',
            'Zamówienie ma status opłacone, ale brakuje przypisanego kodu.'
          );
        }
        payload = { order, code: order.codeId, alreadyPaid: true };
        return;
      }

      if (order.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'Zamówienie nie oczekuje na płatność.');
      }
      if (order.product !== 'sg') {
        throw new HttpsError('failed-precondition', 'Na tym etapie obsługiwane są wyłącznie zamówienia SG.');
      }

      let code = null;
      let codeRef = null;

      // Odczyty kodów wykonywane są przed zapisami w transakcji Firestore.
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = makeCode();
        const candidateRef = db.collection('accessCodes').doc(candidate);
        const existing = await tx.get(candidateRef);
        if (!existing.exists) {
          code = candidate;
          codeRef = candidateRef;
          break;
        }
      }

      if (!code) {
        throw new HttpsError('internal', 'Nie udało się wygenerować unikalnego kodu.');
      }

      // Zgodność z aktualnym mechanizmem aktywacji SG:
      // active=true, product='sg', bez userId (użytkownik przypisuje kod podczas aktywacji).
      tx.create(codeRef, {
        active: true,
        product: 'sg',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        orderId,
        orderNumber: order.number,
        email: order.email
      });

      tx.update(orderRef, {
        status: 'paid',
        codeId: code,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
        confirmedBy: request.auth.uid,
        emailStatus: 'pending',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      payload = { order, code, alreadyPaid: false };
    });

    await deliverOrderEmail(
      orderRef,
      payload.order,
      payload.code,
      RESEND_API_KEY.value()
    );

    return {
      success: true,
      code: payload.code,
      alreadyPaid: payload.alreadyPaid,
      emailSent: true
    };
  }
);

exports.resendAccessEmail = onCall(
  { secrets: [RESEND_API_KEY] },
  async (request) => {
    requireAdmin(request);

    const orderId = String(request.data?.orderId || '');
    if (!validOrderId(orderId)) {
      throw new HttpsError('invalid-argument', 'Nieprawidłowy identyfikator zamówienia.');
    }

    const orderRef = db.collection('orders').doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      throw new HttpsError('not-found', 'Nie znaleziono zamówienia.');
    }

    const order = snap.data();
    if (order.status !== 'paid' || !order.codeId) {
      throw new HttpsError(
        'failed-precondition',
        'Zamówienie nie ma przypisanego opłaconego kodu.'
      );
    }
    if (order.product !== 'sg') {
      throw new HttpsError('failed-precondition', 'Nieobsługiwana formacja.');
    }

    await deliverOrderEmail(
      orderRef,
      order,
      order.codeId,
      RESEND_API_KEY.value()
    );

    return { success: true, code: order.codeId, emailSent: true };
  }
);
