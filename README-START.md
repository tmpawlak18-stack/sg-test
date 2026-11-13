# TESTREKRUT – backend zamówień (etap SG)

## Zawartość
- `functions/index.js` – Cloud Functions v2.
- `functions/package.json` – zależności i runtime Node.js 22.
- `firebase.json` – konfiguracja wdrożenia Functions.

## Zakres tej wersji
- Tworzenie zamówień wyłącznie dla Straży Granicznej.
- Cena 49,99 zł.
- Limit 5 zamówień na IP w 15 minut.
- Numeracja zamówień z osobnym licznikiem dla każdego roku.
- Potwierdzanie płatności wyłącznie przez zweryfikowane konto `testrekrut.pl@gmail.com`.
- Kod tworzony po stronie serwera i zapisywany w `accessCodes` zgodnie z aktualnym schematem SG.
- Ponowna wysyłka używa tego samego kodu.
- Błąd e-maila zapisuje `emailStatus: failed`; kod i status opłacenia pozostają zachowane.

## Ważne przed wdrożeniem
1. Nie wdrażaj, dopóki nie zostanie skonfigurowany i przetestowany Resend.
2. Ustaw sekret `RESEND_API_KEY` w Firebase:
   `firebase functions:secrets:set RESEND_API_KEY`
3. Zweryfikuj domenę `testrekrut.pl` w Resend i nadawcę `dostep@testrekrut.pl`.
4. App Check jest tymczasowo wyłączony dla `createOrder`, ponieważ wymaga równoczesnej konfiguracji w aplikacji klienckiej.
5. Numer BLIK i nazwa odbiorcy nie są częścią tego backendu – muszą zostać potwierdzone i dodane do interfejsu zamówienia.
6. Pozostałe formacje są celowo zablokowane do czasu audytu ich schematów aktywacji.
7. Dashboard pobiera wszystkie zamówienia; przy większej skali należy przejść na agregacje/liczniki.
8. Pole `expiresAt` w `_orderRateLimits` samo nie usuwa dokumentów. Automatyczne czyszczenie wymaga osobnego skonfigurowania TTL w Firestore.

## Wdrożenie
Wdrożenie wykonuj dopiero po testach i świadomej akceptacji:
`firebase deploy --only functions`
