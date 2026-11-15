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
  const accessUrl = `https://testrekrut.pl/${product.slug}/`;
  const subject = `Twój kod dostępu TESTREKRUT — ${product.label}`;
  const text = `Płatność została potwierdzona. Twój dostęp do TESTREKRUT jest gotowy.\n\nFormacja: ${product.label}\nNumer zamówienia: ${orderNo}\nKod dostępu: ${code}\n\nAby aktywować dostęp:\n1. Otwórz stronę ${accessUrl}\n2. Zaloguj się lub utwórz konto.\n3. Wpisz kod w sekcji aktywacji dostępu.\n\nZachowaj tę wiadomość. Kod jest przeznaczony do aktywacji dostępu.\n\nWiadomość wygenerowana automatycznie przez TESTREKRUT.`;
  const html = `<!doctype html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f2f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f5f9;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e9f1">
        <tr><td style="background:#101d35;padding:27px 30px 25px;border-bottom:4px solid #25b8d2">
          <div style="font-size:25px;line-height:30px;font-weight:800;letter-spacing:1.5px;color:#ffffff">TEST<span style="color:#35c4d8">REKRUT</span></div>
          <div style="font-size:11px;letter-spacing:2px;color:#aebbd0;margin-top:6px">PRZYGOTUJ SIĘ. ZDAJ. DOŁĄCZ.</div>
        </td></tr>
        <tr><td style="padding:30px 30px 12px">
          <div style="display:inline-block;background:#e8f8fb;color:#087f94;font-size:11px;font-weight:700;letter-spacing:1px;padding:7px 11px;border-radius:20px">PŁATNOŚĆ POTWIERDZONA</div>
          <h1 style="font-size:25px;line-height:32px;margin:17px 0 9px;color:#14233d">Twój dostęp jest gotowy!</h1>
          <p style="font-size:15px;line-height:24px;color:#58667b;margin:0">Dziękujemy za zakup. Poniżej znajdziesz kod, który umożliwi Ci aktywację dostępu do testów.</p>
        </td></tr>
        <tr><td style="padding:18px 30px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fc;border:1px solid #e7edf5;border-radius:12px">
            <tr><td style="padding:18px 20px 8px;color:#748197;font-size:11px;font-weight:700;letter-spacing:1px">SZCZEGÓŁY ZAKUPU</td></tr>
            <tr><td style="padding:3px 20px 16px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:7px 0;color:#66748a;font-size:13px">Formacja</td><td align="right" style="padding:7px 0;color:#14233d;font-size:14px;font-weight:700">${product.label}</td></tr>
                <tr><td style="padding:7px 0;color:#66748a;font-size:13px;border-top:1px solid #e5ebf3">Numer zamówienia</td><td align="right" style="padding:7px 0;color:#14233d;font-size:14px;font-weight:700;border-top:1px solid #e5ebf3">${orderNo}</td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:22px 30px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf7fb;border:1px solid #d7edf3;border-radius:12px">
            <tr><td align="center" style="padding:22px 18px 8px;color:#087f94;font-size:11px;font-weight:700;letter-spacing:1.5px">TWÓJ KOD DOSTĘPU</td></tr>
            <tr><td align="center" style="padding:4px 14px 22px;color:#14233d;font-size:27px;line-height:36px;font-weight:800;letter-spacing:2px;overflow-wrap:anywhere">${code}</td></tr>
          </table>
          <p style="font-size:13px;line-height:21px;color:#68768a;text-align:center;margin:12px 0 0">Skopiuj kod dokładnie w takiej postaci, w jakiej został podany.</p>
        </td></tr>
        <tr><td style="padding:22px 30px 8px">
          <h2 style="font-size:18px;margin:0 0 12px;color:#14233d">Jak aktywować dostęp?</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fc;border-radius:12px">
            <tr><td style="padding:16px 18px;color:#526178;font-size:14px;line-height:23px">1. Otwórz stronę testów dla formacji <b style="color:#14233d">${product.label}</b>.<br>2. Zaloguj się lub utwórz konto.<br>3. W sekcji aktywacji dostępu wpisz otrzymany kod.</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:24px 30px 28px">
          <a href="${accessUrl}" style="display:inline-block;background:#087f94;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 24px;border-radius:8px">Aktywuj dostęp</a>
          <p style="font-size:11px;line-height:18px;color:#8792a3;margin:20px 0 0">Zachowaj tę wiadomość, aby mieć kod pod ręką.<br>Wiadomość wygenerowana automatycznie przez TESTREKRUT.</p>
        </td></tr>
      </table>
      <div style="font-size:11px;color:#9aa4b2;padding:16px 10px 0;text-align:center">© TESTREKRUT</div>
    </td></tr>
  </table>
</body></html>`;
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


async function sendOrderConfirmationEmail({ to, orderNo, productLabel }, apiKey) {
  const accountNumber = '70 1940 1076 6461 3640 0000 0000';
  const blikPhone = '+48 608 737 181';
  const amount = '49,99 zł';
  const subject = `Potwierdzenie zamówienia ${orderNo} — TESTREKRUT`;
  const text = `Dziękujemy za złożenie zamówienia w TESTREKRUT.\n\nPrzyjęliśmy Twoje zamówienie i oczekujemy na płatność.\n\nNumer zamówienia: ${orderNo}\nWybrana formacja: ${productLabel}\nKwota do zapłaty: ${amount}\n\nDANE DO PŁATNOŚCI\nOdbiorca: TESTREKRUT.pl\nNumer rachunku: ${accountNumber}\nBLIK na telefon: ${blikPhone}\nTytuł przelewu: ${orderNo}\n\nWażne: wpisz dokładnie numer zamówienia w tytule płatności. Kod dostępu wyślemy na ten adres e-mail po zaksięgowaniu i potwierdzeniu płatności.\n\nTo jest automatyczne potwierdzenie przyjęcia zamówienia — nie jest potwierdzeniem otrzymania płatności.`;
  const html = `<!doctype html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f2f5f9;font-family:Arial,Helvetica,sans-serif;color:#172033">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f2f5f9;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e9f1">
        <tr><td style="background:#101d35;padding:27px 30px 25px;border-bottom:4px solid #25b8d2">
          <div style="font-size:25px;line-height:30px;font-weight:800;letter-spacing:1.5px;color:#ffffff">TEST<span style="color:#35c4d8">REKRUT</span></div>
          <div style="font-size:11px;letter-spacing:2px;color:#aebbd0;margin-top:6px">PRZYGOTUJ SIĘ. ZDAJ. DOŁĄCZ.</div>
        </td></tr>
        <tr><td style="padding:30px 30px 12px">
          <div style="display:inline-block;background:#e8f8fb;color:#087f94;font-size:11px;font-weight:700;letter-spacing:1px;padding:7px 11px;border-radius:20px">ZAMÓWIENIE PRZYJĘTE</div>
          <h1 style="font-size:25px;line-height:32px;margin:17px 0 9px;color:#14233d">Dziękujemy za zamówienie!</h1>
          <p style="font-size:15px;line-height:24px;color:#58667b;margin:0">Twoje zamówienie zostało zapisane. Poniżej znajdziesz dane potrzebne do dokonania płatności.</p>
        </td></tr>
        <tr><td style="padding:18px 30px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f8fc;border:1px solid #e7edf5;border-radius:12px">
            <tr><td style="padding:18px 20px 8px;color:#748197;font-size:11px;font-weight:700;letter-spacing:1px">PODSUMOWANIE ZAMÓWIENIA</td></tr>
            <tr><td style="padding:3px 20px 16px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:7px 0;color:#66748a;font-size:13px">Numer zamówienia</td><td align="right" style="padding:7px 0;color:#14233d;font-size:14px;font-weight:700">${orderNo}</td></tr>
                <tr><td style="padding:7px 0;color:#66748a;font-size:13px;border-top:1px solid #e5ebf3">Formacja</td><td align="right" style="padding:7px 0;color:#14233d;font-size:14px;font-weight:700;border-top:1px solid #e5ebf3">${productLabel}</td></tr>
                <tr><td style="padding:12px 0 2px;color:#66748a;font-size:13px;border-top:1px solid #e5ebf3">Do zapłaty</td><td align="right" style="padding:8px 0 0;color:#087f94;font-size:24px;font-weight:800;border-top:1px solid #e5ebf3">${amount}</td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:22px 30px 8px">
          <h2 style="font-size:18px;margin:0 0 13px;color:#14233d">Dane do płatności</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf7fb;border:1px solid #d7edf3;border-radius:12px">
            <tr><td style="padding:18px 20px 4px;color:#66748a;font-size:12px">Odbiorca</td></tr>
            <tr><td style="padding:0 20px 13px;color:#14233d;font-size:15px;font-weight:700">TESTREKRUT.pl</td></tr>
            <tr><td style="padding:0 20px 4px;color:#66748a;font-size:12px">Numer rachunku bankowego</td></tr>
            <tr><td style="padding:0 20px 14px;color:#14233d;font-size:18px;line-height:26px;font-weight:800;letter-spacing:.5px;overflow-wrap:anywhere">${accountNumber}</td></tr>
            <tr><td style="padding:0 20px 4px;color:#66748a;font-size:12px;border-top:1px solid #d7eaf0">BLIK na telefon</td></tr>
            <tr><td style="padding:5px 20px 14px;color:#14233d;font-size:16px;font-weight:700">${blikPhone}</td></tr>
            <tr><td style="padding:0 20px 4px;color:#66748a;font-size:12px;border-top:1px solid #d7eaf0">Tytuł płatności — wpisz dokładnie</td></tr>
            <tr><td style="padding:5px 20px 18px;color:#087f94;font-size:19px;font-weight:800">${orderNo}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:18px 30px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e8;border-left:4px solid #f0b84b;border-radius:8px">
            <tr><td style="padding:14px 16px;color:#72551b;font-size:13px;line-height:21px"><b>Ważne:</b> koniecznie podaj numer zamówienia w tytule przelewu. Kod dostępu wyślemy na ten adres e-mail po zaksięgowaniu i potwierdzeniu płatności.</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:24px 30px 28px">
          <a href="https://testrekrut.pl/" style="display:inline-block;background:#087f94;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 24px;border-radius:8px">Przejdź do TESTREKRUT</a>
          <p style="font-size:11px;line-height:18px;color:#8792a3;margin:20px 0 0">To automatyczne potwierdzenie przyjęcia zamówienia, a nie potwierdzenie otrzymania płatności.<br>Wiadomość wysłana przez TESTREKRUT.</p>
        </td></tr>
      </table>
      <div style="font-size:11px;color:#9aa4b2;padding:16px 10px 0;text-align:center">© TESTREKRUT</div>
    </td></tr>
  </table>
</body></html>`;
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
    // Kod jest nieprzypisany przy zakupie. Pusty userId pozwala istniejącemu
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
