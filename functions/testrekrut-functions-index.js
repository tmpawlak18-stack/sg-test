const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
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


async function sendAdminPaymentNotification({ orderNo, customerEmail, code, productLabel }, apiKey) {
  const subject = `TESTREKRUT — potwierdzono wpłatę ${orderNo}`;
  const text = `Potwierdzono płatność za zamówienie TESTREKRUT.\n\nNumer zamówienia: ${orderNo}\nE-mail klienta: ${customerEmail}\nFormacja: ${productLabel}\nKod wysłany klientowi: ${code}`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;color:#172033;line-height:1.6">
    <h2>TESTREKRUT — potwierdzono wpłatę</h2>
    <p>Potwierdzono płatność za zamówienie.</p>
    <p><b>Numer zamówienia:</b> ${escapeHtml(orderNo)}<br>
    <b>E-mail klienta:</b> ${escapeHtml(customerEmail)}<br>
    <b>Formacja:</b> ${escapeHtml(productLabel)}</p>
    <p><b>Kod wysłany klientowi:</b><br>
    <span style="font-size:22px;font-weight:bold;letter-spacing:1px">${escapeHtml(code)}</span></p>
  </body></html>`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'TESTREKRUT <dostep@testrekrut.pl>',
      to: [ADMIN_EMAIL],
      subject,
      text,
      html
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

  // Osobne powiadomienie administratora. Jego ewentualna awaria nie wpływa
  // na status płatności ani na wysłanie kodu klientowi.
  let adminEmailSent = false;
  if (!payload.alreadyPaid) {
    try {
      const adminMail = await sendAdminPaymentNotification({
        orderNo: payload.order.number,
        customerEmail: payload.order.email,
        code: payload.code,
        productLabel: payload.order.productLabel || PRODUCTS[payload.order.product].label
      }, RESEND_API_KEY.value());
      await orderRef.update({
        adminPaymentEmailStatus: 'sent',
        adminPaymentEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        adminPaymentEmailMessageId: adminMail.id || null
      });
      adminEmailSent = true;
    } catch (error) {
      console.error('Nie udało się wysłać administratorowi powiadomienia o wpłacie:', error);
      await orderRef.update({
        adminPaymentEmailStatus: 'failed',
        adminPaymentEmailError: String(error.message || error).slice(0, 500)
      });
    }
  }
  return { success: true, code: payload.code, alreadyPaid: payload.alreadyPaid, emailSent: true, adminEmailSent };
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


// Tokeny urządzeń administratora są zapisywane wyłącznie przez uwierzytelnioną funkcję.
exports.registerAdminPushToken = onCall(async request => {
  requireAdmin(request);
  const token = String(request.data?.token || '').trim();
  if (token.length < 50 || token.length > 4096) throw new HttpsError('invalid-argument', 'Nieprawidłowy token urządzenia.');
  const tokenId = crypto.createHash('sha256').update(token).digest('hex');
  await db.collection('adminPushTokens').doc(tokenId).set({
    token, uid: request.auth.uid, email: ADMIN_EMAIL,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(), active: true
  }, { merge: true });
  return { success: true };
});

exports.unregisterAdminPushToken = onCall(async request => {
  requireAdmin(request);
  const token = String(request.data?.token || '').trim();
  if (!token) throw new HttpsError('invalid-argument', 'Brak tokenu urządzenia.');
  const tokenId = crypto.createHash('sha256').update(token).digest('hex');
  await db.collection('adminPushTokens').doc(tokenId).delete();
  return { success: true };
});

// Powiadomienie jest wysyłane po utworzeniu nowego zamówienia (nie po odświeżeniu panelu).
exports.notifyAdminOnNewOrder = onDocumentCreated('orders/{orderId}', async event => {
  const order = event.data?.data();
  if (!order) return;
  const snap = await db.collection('adminPushTokens').where('active', '==', true).get();
  if (snap.empty) return;
  const tokens = snap.docs.map(d => ({ id: d.id, token: d.data().token })).filter(x => !!x.token);
  if (!tokens.length) return;
  const message = {
    notification: {
      title: 'TESTREKRUT — nowe zamówienie',
      body: `${order.number || 'Nowe zamówienie'} • ${order.productLabel || order.product || 'Formacja'} • ${(Number(order.amountGrosz || 0) / 100).toFixed(2).replace('.', ',')} zł`
    },
    data: { orderId: event.params.orderId, url: 'https://testrekrut.pl/admin/' },
    webpush: { fcmOptions: { link: 'https://testrekrut.pl/admin/' }, notification: { icon: 'https://testrekrut.pl/admin/testrekrut-admin-192.png', badge: 'https://testrekrut.pl/admin/testrekrut-admin-192.png', tag: `order-${event.params.orderId}` } },
    tokens: tokens.map(x => x.token)
  };
  const result = await admin.messaging().sendEachForMulticast(message);
  const batch = db.batch();
  result.responses.forEach((response, index) => {
    if (!response.success) {
      const code = response.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        batch.delete(db.collection('adminPushTokens').doc(tokens[index].id));
      }
    }
  });
  await batch.commit();
  console.log(`Admin push: ${result.successCount} sent, ${result.failureCount} failed.`);
});


// ===== TESTREKRUT V2 — FUNDAMENT NOWEGO MODELU KONT (ETAP 1) =====
// Funkcje są dodatkiem do obecnego systemu. Nie modyfikują ani nie usuwają
// starych dokumentów sgAccess/scsAccess/swAccess/userAccess.
const ENTITLEMENT_PRODUCTS = new Set(['sg', 'policja', 'celno-skarbowa', 'sw']);

function requireVerifiedAccount(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Zaloguj się na konto TESTREKRUT.');
  }
  const provider = request.auth.token?.firebase?.sign_in_provider;
  const email = String(request.auth.token?.email || '').trim().toLowerCase();
  if (provider === 'anonymous' || !validEmail(email) || request.auth.token?.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Wymagane jest konto z potwierdzonym adresem e-mail.');
  }
  return email;
}

/**
 * Jednorazowo/ponownie inicjalizuje profil użytkownika. Merge zachowuje
 * istniejące pola i nigdy nie nadpisuje statusu administratora ani uprawnień.
 */
exports.initializeUserProfileV2 = onCall(async request => {
  const email = requireVerifiedAccount(request);
  const uid = request.auth.uid;
  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async tx => {
    const snap = await tx.get(userRef);
    const now = admin.firestore.FieldValue.serverTimestamp();
    if (!snap.exists) {
      tx.create(userRef, {
        uid,
        email,
        emailVerified: true,
        status: 'active',
        sessionVersion: 1,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now
      });
    } else {
      const data = snap.data() || {};
      if (data.status === 'blocked') {
        throw new HttpsError('permission-denied', 'To konto jest zablokowane.');
      }
      tx.set(userRef, {
        uid,
        email,
        emailVerified: true,
        schemaVersion: 2,
        updatedAt: now,
        lastLoginAt: now
      }, { merge: true });
    }
  });
  return { success: true, uid };
});

/**
 * Bezpiecznie sprawdza kod przed logowaniem/rejestracją. Nie przypisuje kodu
 * i nie wymaga dostępu klienta do kolekcji accessCodes.
 */
exports.validateAccessCodeV2 = onCall(async request => {
  const code = String(request.data?.code || '').trim().toUpperCase();
  const expectedProduct = String(request.data?.product || '').trim();
  if (!code || code.length > 40) {
    throw new HttpsError('invalid-argument', 'Podaj prawidłowy kod dostępu.');
  }

  const snap = await db.collection('accessCodes').doc(code).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Nie znaleziono takiego kodu dostępu.');
  const data = snap.data() || {};
  const product = String(data.product || '');
  if (data.active !== true) throw new HttpsError('failed-precondition', 'Ten kod jest nieaktywny.');
  if (!ENTITLEMENT_PRODUCTS.has(product)) throw new HttpsError('failed-precondition', 'Kod ma nieprawidłowy produkt.');
  if (expectedProduct && product !== expectedProduct) {
    throw new HttpsError('failed-precondition', 'Ten kod nie jest przeznaczony dla wybranej formacji.');
  }

  const assignedUid = String(data.userId || '');
  const callerUid = request.auth && request.auth.token?.firebase?.sign_in_provider !== 'anonymous'
    ? request.auth.uid : '';
  return {
    valid: true,
    product,
    alreadyClaimed: Boolean(assignedUid),
    belongsToCurrentUser: Boolean(assignedUid && callerUid && assignedUid === callerUid)
  };
});

/**
 * Przypisuje kod do zalogowanego, zweryfikowanego konta i tworzy centralne
 * uprawnienie users/{uid}/entitlements/{product}. Nie odbiera i nie zmienia
 * starych uprawnień; zachowuje listę wszystkich wykorzystanych kodów.
 */
exports.claimAccessCodeV2 = onCall(async request => {
  const email = requireVerifiedAccount(request);
  const uid = request.auth.uid;
  const code = String(request.data?.code || '').trim().toUpperCase();
  if (!code || code.length > 40) {
    throw new HttpsError('invalid-argument', 'Podaj prawidłowy kod dostępu.');
  }

  const codeRef = db.collection('accessCodes').doc(code);
  const userRef = db.collection('users').doc(uid);
  let claimedProduct = '';

  await db.runTransaction(async tx => {
    const codeSnap = await tx.get(codeRef);
    if (!codeSnap.exists) throw new HttpsError('not-found', 'Nie znaleziono takiego kodu.');
    const codeData = codeSnap.data() || {};
    const product = String(codeData.product || '');
    if (codeData.active !== true) throw new HttpsError('failed-precondition', 'Ten kod jest nieaktywny.');
    if (!ENTITLEMENT_PRODUCTS.has(product)) throw new HttpsError('failed-precondition', 'Kod ma nieprawidłowy produkt.');
    if (codeData.userId && codeData.userId !== uid) {
      throw new HttpsError('already-exists', 'Kod został już przypisany do innego konta. Skontaktuj się z pomocą TESTREKRUT.');
    }

    const entitlementRef = userRef.collection('entitlements').doc(product);
    const [userSnap, entitlementSnap] = await Promise.all([tx.get(userRef), tx.get(entitlementRef)]);
    if (userSnap.exists && userSnap.data()?.status === 'blocked') {
      throw new HttpsError('permission-denied', 'To konto jest zablokowane.');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    if (!userSnap.exists) {
      tx.create(userRef, {
        uid,
        email,
        emailVerified: true,
        status: 'active',
        sessionVersion: 1,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now
      });
    } else {
      tx.set(userRef, { email, emailVerified: true, schemaVersion: 2, updatedAt: now, lastLoginAt: now }, { merge: true });
    }

    if (!codeData.userId) {
      tx.update(codeRef, {
        userId: uid,
        claimedAt: now,
        claimedByEmail: email
      });
    }

    const previous = entitlementSnap.exists ? (entitlementSnap.data() || {}) : {};
    const previousCodes = Array.isArray(previous.codeIds) ? previous.codeIds : (previous.code ? [previous.code] : []);
    const codeIds = Array.from(new Set([...previousCodes, code]));
    tx.set(entitlementRef, {
      product,
      active: true,
      code: codeIds[codeIds.length - 1],
      codeIds,
      grantedAt: previous.grantedAt || now,
      updatedAt: now,
      revokedAt: admin.firestore.FieldValue.delete()
    }, { merge: true });
    claimedProduct = product;
  });

  return { success: true, product: claimedProduct };
});

/** Zwraca centralne uprawnienia oraz status konta wyłącznie właścicielowi UID. */
exports.getMyAccountV2 = onCall(async request => {
  const email = requireVerifiedAccount(request);
  const uid = request.auth.uid;
  const userRef = db.collection('users').doc(uid);
  const [userSnap, entitlementsSnap] = await Promise.all([
    userRef.get(),
    userRef.collection('entitlements').get()
  ]);
  if (!userSnap.exists) {
    return { exists: false, email, status: 'active', entitlements: [] };
  }
  const user = userSnap.data() || {};
  return {
    exists: true,
    email,
    status: user.status || 'active',
    sessionVersion: Number(user.sessionVersion || 1),
    entitlements: entitlementsSnap.docs.map(doc => ({
      product: doc.id,
      active: doc.data().active === true,
      codeIds: Array.isArray(doc.data().codeIds) ? doc.data().codeIds : (doc.data().code ? [doc.data().code] : [])
    }))
  };
});

function adminUserSummary(userRecord, profileData = {}, entitlements = []) {
  return {
    uid: userRecord.uid,
    email: userRecord.email || profileData.email || '',
    emailVerified: userRecord.emailVerified === true,
    disabled: userRecord.disabled === true,
    status: profileData.status || (userRecord.disabled ? 'blocked' : 'active'),
    createdAt: userRecord.metadata?.creationTime || null,
    lastSignInAt: userRecord.metadata?.lastSignInTime || null,
    sessionVersion: Number(profileData.sessionVersion || 1),
    entitlements
  };
}

async function readUserEntitlements(uid) {
  const snap = await db.collection('users').doc(uid).collection('entitlements').get();
  return snap.docs.map(doc => {
    const data = doc.data() || {};
    return {
      product: doc.id,
      active: data.active === true,
      codeIds: Array.isArray(data.codeIds) ? data.codeIds : (data.code ? [data.code] : []),
      grantedAt: data.grantedAt?.toDate?.().toISOString?.() || null,
      revokedAt: data.revokedAt?.toDate?.().toISOString?.() || null
    };
  });
}

// Lista kont z Firebase Authentication. Maksymalnie 50 rekordów na stronę.
// pageToken zwracany przez funkcję należy przekazać przy następnym wywołaniu.
exports.adminListUsersV2 = onCall(async request => {
  requireAdmin(request);
  const requested = Number(request.data?.limit || 25);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? Math.floor(requested) : 25, 1), 50);
  const pageToken = typeof request.data?.pageToken === 'string' && request.data.pageToken
    ? request.data.pageToken : undefined;

  const page = await admin.auth().listUsers(limit, pageToken);
  const users = await Promise.all(page.users.map(async record => {
    const profileSnap = await db.collection('users').doc(record.uid).get();
    const profile = profileSnap.exists ? profileSnap.data() || {} : {};
    const entitlements = await readUserEntitlements(record.uid);
    return adminUserSummary(record, profile, entitlements);
  }));

  return { users, nextPageToken: page.pageToken || null };
});

// Wyszukiwanie dokładne po adresie e-mail.
exports.adminFindUserV2 = onCall(async request => {
  requireAdmin(request);
  const email = String(request.data?.email || '').trim().toLowerCase();
  if (!validEmail(email)) throw new HttpsError('invalid-argument', 'Podaj prawidłowy adres e-mail.');

  let record;
  try {
    record = await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (error.code === 'auth/user-not-found') throw new HttpsError('not-found', 'Nie znaleziono użytkownika.');
    throw error;
  }

  const profileSnap = await db.collection('users').doc(record.uid).get();
  const profile = profileSnap.exists ? profileSnap.data() || {} : {};
  const entitlements = await readUserEntitlements(record.uid);
  return { user: adminUserSummary(record, profile, entitlements) };
});

// Szczegóły konta po UID — do użycia po wybraniu użytkownika z listy.
exports.adminGetUserV2 = onCall(async request => {
  requireAdmin(request);
  const uid = String(request.data?.uid || '').trim();
  if (!uid || uid.length > 128) throw new HttpsError('invalid-argument', 'Nieprawidłowy identyfikator użytkownika.');

  let record;
  try {
    record = await admin.auth().getUser(uid);
  } catch (error) {
    if (error.code === 'auth/user-not-found') throw new HttpsError('not-found', 'Nie znaleziono użytkownika.');
    throw error;
  }

  const profileSnap = await db.collection('users').doc(uid).get();
  const profile = profileSnap.exists ? profileSnap.data() || {} : {};
  const entitlements = await readUserEntitlements(uid);
  return { user: adminUserSummary(record, profile, entitlements), profileExists: profileSnap.exists };
});

// Blokada logowania i oznaczenie profilu. Nie usuwa kodów ani zakupionych uprawnień.
exports.adminBlockUserV2 = onCall(async request => {
  requireAdmin(request);
  const uid = String(request.data?.uid || '').trim();
  if (!uid || uid.length > 128) throw new HttpsError('invalid-argument', 'Nieprawidłowy identyfikator użytkownika.');
  if (uid === request.auth.uid) throw new HttpsError('failed-precondition', 'Nie możesz zablokować własnego konta administratora.');

  const userRef = db.collection('users').doc(uid);
  // Najpierw wyłączamy konto w Authentication. Jeśli zapis profilu się nie powiedzie,
  // konto pozostaje zablokowane w Auth — bezpieczniejszy stan niż pozostawienie dostępu.
  try {
    await admin.auth().updateUser(uid, { disabled: true });
  } catch (error) {
    if (error.code === 'auth/user-not-found') throw new HttpsError('not-found', 'Nie znaleziono użytkownika.');
    throw error;
  }
  await userRef.set({
    status: 'blocked',
    sessionVersion: admin.firestore.FieldValue.increment(1),
    blockedAt: admin.firestore.FieldValue.serverTimestamp(),
    blockedBy: request.auth.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await admin.auth().revokeRefreshTokens(uid);
  return { success: true, uid, status: 'blocked', purchasesPreserved: true };
});

// Odblokowanie konta. Zachowuje wszystkie dotychczasowe entitlement i kody.
exports.adminUnblockUserV2 = onCall(async request => {
  requireAdmin(request);
  const uid = String(request.data?.uid || '').trim();
  if (!uid || uid.length > 128) throw new HttpsError('invalid-argument', 'Nieprawidłowy identyfikator użytkownika.');

  try {
    await admin.auth().updateUser(uid, { disabled: false });
  } catch (error) {
    if (error.code === 'auth/user-not-found') throw new HttpsError('not-found', 'Nie znaleziono użytkownika.');
    throw error;
  }
  await db.collection('users').doc(uid).set({
    status: 'active',
    unblockedAt: admin.firestore.FieldValue.serverTimestamp(),
    unblockedBy: request.auth.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return { success: true, uid, status: 'active', purchasesPreserved: true };
});

// Zdalne wylogowanie bez blokowania konta i bez odbierania zakupów.
// sessionVersion pozwoli frontendowi V2 wykryć unieważnienie sesji.
exports.adminRevokeUserSessionsV2 = onCall(async request => {
  requireAdmin(request);
  const uid = String(request.data?.uid || '').trim();
  if (!uid || uid.length > 128) throw new HttpsError('invalid-argument', 'Nieprawidłowy identyfikator użytkownika.');

  let record;
  try {
    record = await admin.auth().getUser(uid);
  } catch (error) {
    if (error.code === 'auth/user-not-found') throw new HttpsError('not-found', 'Nie znaleziono użytkownika.');
    throw error;
  }

  const userRef = db.collection('users').doc(uid);
  let nextVersion = 2;
  await db.runTransaction(async tx => {
    const profileSnap = await tx.get(userRef);
    const currentVersion = Number(profileSnap.data()?.sessionVersion || 1);
    nextVersion = currentVersion + 1;
    tx.set(userRef, {
      sessionVersion: nextVersion,
      sessionsRevokedAt: admin.firestore.FieldValue.serverTimestamp(),
      sessionsRevokedBy: request.auth.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });

  // Celowo nie unieważniamy tutaj refresh tokenów Firebase. Aplikacja klienta
  // sprawdza sessionVersion co 15 sekund; zachowanie możliwości odświeżenia
  // tokenu pozwala jej pobrać nową wersję i wykonać kontrolowane wylogowanie.
  return {
    success: true,
    uid,
    sessionVersion: nextVersion,
    accountDisabled: record.disabled === true,
    note: 'Aplikacja klienta wykryje zmianę sessionVersion przy najbliższej kontroli sesji (standardowo do 15 sekund).'
  };
});

