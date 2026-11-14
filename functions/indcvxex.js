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
// Klucze PRODUCTS są identyfikatorami formacji używanymi w zamówieniach.
// accessProduct to wartość zapisywana w accessCodes.product, a codePrefix
// określa prefiks kodu przekazywanego klientowi.
const PRODUCTS = {
  sg: { label: 'Straż Graniczna', slug: 'straz-graniczna', codePrefix: 'SG', accessProduct: 'sg' },
  policja: { label: 'Policja', slug: 'policja', codePrefix: 'POL', accessProduct: 'policja' },
  'celno-skarbowa': { label: 'Służba Celno-Skarbowa', slug: 'celno-skarbowa', codePrefix: 'SCS', accessProduct: 'celno-skarbowa' },
  'sluzba-wiezienna': { label: 'Służba Więzienna', slug: 'sluzba-wiezienna', codePrefix: 'SW', accessProduct: 'sw' }
};

function requireAdmin(request) {
  const email = request.auth?.token?.email;
  const verified = request.auth?.token?.email_verified === true;
  if (!request.auth || email !== ADMIN_EMAIL || !verified) {
    throw new HttpsError('permission-denied', 'Brak uprawnień administratora.');
  }
}
function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
function makeCode(prefix) {
  // 8 znaków losowych: XXXX-XXXX. Alfabet ma 32 znaki, więc maska
  // 0x1f daje równomierny rozkład bez błędu modulo.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  const randomPart = Array.from(bytes, b => alphabet[b & 0x1f]).join('');
  return `${prefix}-${randomPart.slice(0, 4)}-${randomPart.slice(4, 8)}`;
}
function orderNumber(seq, year) {
  return `TR-${year}-${String(seq).padStart(5, '0')}`;
}
async function sendAccessEmail({ to, code, product, orderNo }, apiKey) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response.json();
}


async function sendOrderConfirmationEmail({ to, orderNo, productLabel }, apiKey) {
  const accountNumber = '70 1940 1076 6461 3640 0000 0000';
  const blikPhone = '+48 608 737 181';
  const amount = '49,99 zł';
  const subject = `Potwierdzenie zamówienia ${orderNo} — TESTREKRUT`;
  const text = `Dziękujemy za złożenie zamówienia w TESTREKRUT.\n\nPrzyjęliśmy Twoje zamówienie i oczekujemy na płatność.\n\nNumer zamówienia: ${orderNo}\nWybrana formacja: ${productLabel}\nKwota do zapłaty: ${amount}\n\nDANE DO PŁATNOŚCI\nOdbiorca: TESTREKRUT.pl\nNumer rachunku: ${accountNumber}\nBLIK na telefon: ${blikPhone}\nTytuł przelewu: ${orderNo}\n\nWażne: wpisz dokładnie numer zamówienia w tytule płatności. Kod dostępu wyślemy na ten adres e-mail po zaksięgowaniu i potwierdzeniu płatności.\n\nTo jest automatyczne potwierdzenie przyjęcia zamówienia — nie jest potwierdzeniem otrzymania płatności.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:24px auto;padding:24px;color:#172033;border:1px solid #e5eaf1;border-radius:14px"><h2 style="margin-top:0">TESTREKRUT</h2><h3>Potwierdzenie przyjęcia zamówienia</h3><p>Dziękujemy za złożenie zamówienia. Oczekujemy na płatność.</p><div style="background:#f3f6fa;padding:16px;border-radius:10px"><p style="margin:5px 0">Numer zamówienia: <b>${orderNo}</b></p><p style="margin:5px 0">Wybrana formacja: <b>${productLabel}</b></p><p style="margin:5px 0">Kwota do zapłaty: <b>${amount}</b></p></div><h3 style="margin-bottom:8px">Dane do płatności</h3><div style="background:#eef4fb;padding:18px;border-radius:10px"><p style="margin:5px 0">Odbiorca: <b>TESTREKRUT.pl</b></p><p style="margin:5px 0">Numer rachunku:</p><p style="font-size:19px;font-weight:bold;letter-spacing:1px;margin:4px 0 12px">${accountNumber}</p><p style="margin:5px 0">BLIK na telefon: <b>${blikPhone}</b></p><p style="margin:12px 0 5px">Tytuł płatności:</p><p style="font-size:18px;font-weight:bold;margin:4px 0">${orderNo}</p></div><p><b>Ważne:</b> wpisz dokładnie numer zamówienia w tytule płatności. Kod dostępu wyślemy na ten adres e-mail po zaksięgowaniu i potwierdzeniu płatności.</p><p style="font-size:12px;color:#687386">To jest automatyczne potwierdzenie przyjęcia zamówienia — nie jest potwierdzeniem otrzymania płatności.</p></div>`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'TESTREKRUT <dostep@testrekrut.pl>', to: [to], subject, text, html })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response.json();
}

exports.createOrder = onCall({ maxInstances: 5, enforceAppCheck: false, secrets: [RESEND_API_KEY] }, async (request) => {
  const email = String(request.data?.email || '').trim().toLowerCase();
  const productKey = String(request.data?.product || '');
  if (!validEmail(email)) throw new HttpsError('invalid-argument', 'Podaj prawidłowy adres e-mail.');
  if (!PRODUCTS[productKey]) throw new HttpsError('invalid-argument', 'Nieprawidłowa formacja.');

  // Prosty limit na IP: 5 nowych zamówień w ciągu 15 minut.
  const ip = String(request.rawRequest?.ip || 'unknown').slice(0, 80);
  const now = Date.now();
  const rateRef = db.collection('_orderRateLimits').doc(crypto.createHash('sha256').update(ip).digest('hex'));
  const counterRef = db.collection('_counters').doc('orders');
  const orderRef = db.collection('orders').doc();
  const result = await db.runTransaction(async tx => {
    const [rateSnap, counterSnap] = await Promise.all([tx.get(rateRef), tx.get(counterRef)]);
    const rate = rateSnap.exists ? rateSnap.data() : {};
    const windowStart = Number(rate.windowStart || 0);
    const count = windowStart && now - windowStart < 15 * 60 * 1000 ? Number(rate.count || 0) : 0;
    if (count >= 5) throw new HttpsError('resource-exhausted', 'Zbyt wiele prób. Spróbuj ponownie za 15 minut.');
    const nextCount = count + 1;
    tx.set(rateRef, { windowStart: count ? windowStart : now, count: nextCount, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const seq = Number(counterSnap.data()?.value || 0) + 1;
    tx.set(counterRef, { value: seq, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const year = new Date().getFullYear();
    const number = orderNumber(seq, year);
    tx.create(orderRef, {
      number, email, product: productKey, productLabel: PRODUCTS[productKey].label,
      amountGrosz: PRICE_GROSZ, currency: 'PLN', status: 'pending',
      paymentMethod: 'BLIK', createdAt: admin.firestore.FieldValue.serverTimestamp(),
      codeId: null, emailSentAt: null
    });
    return { number, amount: '49,99 zł', paymentTitle: number, productLabel: PRODUCTS[productKey].label };
  });
  // Potwierdzenie zamówienia wysyłamy po zapisaniu dokumentu, aby awaria poczty
  // nie powodowała utraty zamówienia ani nie zachęcała klienta do składania duplikatu.
  let emailSent = false;
  try {
    const mail = await sendOrderConfirmationEmail({
      to: email,
      orderNo: result.number,
      productLabel: result.productLabel
    }, RESEND_API_KEY.value());
    await orderRef.update({
      orderConfirmationEmailStatus: 'sent',
      orderConfirmationEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      orderConfirmationResendMessageId: mail.id || null
    });
    emailSent = true;
  } catch (error) {
    console.error('Nie udało się wysłać potwierdzenia zamówienia:', error);
    await orderRef.update({
      orderConfirmationEmailStatus: 'failed',
      orderConfirmationEmailError: String(error.message || error).slice(0, 500)
    });
  }
  return { ...result, emailSent };
});

exports.listOrders = onCall(async request => {
  requireAdmin(request);
  const status = String(request.data?.status || 'all');
  const limit = Math.min(Math.max(Number(request.data?.limit || 100), 1), 200);
  let query = db.collection('orders').orderBy('createdAt', 'desc').limit(limit);
  if (status !== 'all') query = db.collection('orders').where('status', '==', status).orderBy('createdAt', 'desc').limit(limit);
  const snap = await query.get();
  return { orders: snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.().toISOString() || null, paidAt: d.data().paidAt?.toDate?.().toISOString() || null })) };
});

exports.getDashboard = onCall(async request => {
  requireAdmin(request);
  const snap = await db.collection('orders').get();
  const all = snap.docs.map(d => d.data());
  const paid = all.filter(o => o.status === 'paid');
  return { total: all.length, pending: all.filter(o => o.status === 'pending').length, paid: paid.length, revenueGrosz: paid.reduce((sum, o) => sum + Number(o.amountGrosz || 0), 0) };
});

exports.confirmPayment = onCall({ secrets: [RESEND_API_KEY] }, async request => {
  requireAdmin(request);
  const orderId = String(request.data?.orderId || '');
  if (!orderId) throw new HttpsError('invalid-argument', 'Brak identyfikatora zamówienia.');
  const orderRef = db.collection('orders').doc(orderId);
  let payload;
  await db.runTransaction(async tx => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Nie znaleziono zamówienia.');
    const order = snap.data();
    if (order.status === 'paid' && order.codeId) {
      const codeSnap = await tx.get(db.collection('accessCodes').doc(order.codeId));
      if (!codeSnap.exists) throw new HttpsError('data-loss', 'Zamówienie ma status opłacone, ale brakuje kodu.');
      payload = { order, code: order.codeId, alreadyPaid: true };
      return;
    }
    if (order.status !== 'pending') throw new HttpsError('failed-precondition', 'Zamówienie nie oczekuje na płatność.');
    const product = PRODUCTS[order.product];
    if (!product) throw new HttpsError('failed-precondition', 'Nieznany produkt zamówienia.');
    let code;
    let codeRef;
    for (let i = 0; i < 5; i++) {
      code = makeCode(product.codePrefix);
      codeRef = db.collection('accessCodes').doc(code);
      const exists = await tx.get(codeRef);
      if (!exists.exists) break;
      code = null;
    }
    if (!code) throw new HttpsError('internal', 'Nie udało się wygenerować unikalnego kodu.');
    // Kod jest nieprzypisany przy zakupie. userId=null pozwala istniejącemu
    // procesowi aktywacji przypisać go pierwszemu użytkownikowi, który go wykorzysta.
    tx.create(codeRef, {
      active: true,
      product: product.accessProduct,
      userId: "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      orderId,
      orderNumber: order.number,
      email: order.email
    });
    tx.update(orderRef, { status: 'paid', codeId: code, paidAt: admin.firestore.FieldValue.serverTimestamp(), confirmedBy: request.auth.uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    payload = { order, code, alreadyPaid: false };
  });

  // Wysyłka po transakcji. Jeśli e-mail nie wyjdzie, status i kod pozostają zapisane;
  // administrator może użyć funkcji resendAccessEmail bez tworzenia nowego kodu.
  const mail = await sendAccessEmail({ to: payload.order.email, code: payload.code, product: PRODUCTS[payload.order.product], orderNo: payload.order.number }, RESEND_API_KEY.value());
  await orderRef.update({ emailSentAt: admin.firestore.FieldValue.serverTimestamp(), emailStatus: 'sent', resendMessageId: mail.id || null });
  return { success: true, code: payload.code, alreadyPaid: payload.alreadyPaid, emailSent: true };
});

exports.resendAccessEmail = onCall({ secrets: [RESEND_API_KEY] }, async request => {
  requireAdmin(request);
  const orderId = String(request.data?.orderId || '');
  if (!orderId) throw new HttpsError('invalid-argument', 'Brak identyfikatora zamówienia.');
  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Nie znaleziono zamówienia.');
  const order = snap.data();
  if (order.status !== 'paid' || !order.codeId) throw new HttpsError('failed-precondition', 'Zamówienie nie ma przypisanego opłaconego kodu.');
  const mail = await sendAccessEmail({ to: order.email, code: order.codeId, product: PRODUCTS[order.product], orderNo: order.number }, RESEND_API_KEY.value());
  await ref.update({ emailSentAt: admin.firestore.FieldValue.serverTimestamp(), emailStatus: 'sent', resendMessageId: mail.id || null });
  return { success: true, code: order.codeId, emailSent: true };
});
