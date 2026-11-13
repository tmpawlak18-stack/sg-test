# TESTREKRUT — przygotowany backend zamówień i panel administratora (etap SG)

## Co znajduje się w paczce
- `functions/index.js` — backend Firebase Functions v2: tworzenie zamówień, lista zamówień, dashboard, potwierdzanie płatności, ponowna wysyłka tego samego kodu.
- `admin/index.html` — statyczny panel Google login, przeznaczony do umieszczenia jako `/admin/index.html` w repozytorium strony TESTREKRUT.
- `firebase.json` — konfiguracja wdrożenia samych Cloud Functions; nie konfiguruje Firebase Hosting i nie zmienia obecnego hostingu strony.

## Ważne ograniczenia przed wdrożeniem
1. Kod jest przygotowany dla projektu Firebase `test-wiedzy-sg` i obecnie tylko potwierdzony schemat SG jest obsłużony end-to-end. Wpisy produktów dla pozostałych formacji są w backendzie, ale nie należy ich sprzedawać, dopóki nie zostaną sprawdzone schematy ich modułów.
2. Nie ma jeszcze formularza zakupu podpiętego do `createOrder`. Nie zmieniono strony głównej ani modułu SG.
3. Nie wpisano numeru BLIK ani nazwy odbiorcy — numer WhatsApp nie może być automatycznie uznany za numer BLIK.
4. Nadawca e-mail `dostep@testrekrut.pl` musi zostać zweryfikowany w Resend (lub zmieniony na zweryfikowaną domenę). Bez tego wysyłka nie zadziała.
5. Publiczne tworzenie zamówień ma limit 5 prób/IP/15 min, ale przed ruchem produkcyjnym zalecane jest włączenie Firebase App Check i testy antyspamowe.
6. Nie ma jeszcze deployu. Nie przełączono projektu na Blaze i nie podpięto konta rozliczeniowego.

## Konfiguracja i wdrożenie (dopiero po świadomej zgodzie na Blaze)
1. W Firebase Console przełącz projekt `test-wiedzy-sg` na Blaze i podłącz billing. Alert budżetowy nie jest twardym limitem wydatków.
2. W katalogu zawierającym `firebase.json` uruchom:
   - `npm install -g firebase-tools`
   - `firebase login`
   - `firebase use test-wiedzy-sg`
   - `cd functions && npm install && cd ..`
   - `firebase functions:secrets:set RESEND_API_KEY`
   - `firebase deploy --only functions`
3. Umieść `admin/index.html` w repozytorium strony pod ścieżką `/admin/index.html`. Nie konfiguruj osobnego Firebase Hosting bez sprawdzenia obecnego hostingu i DNS.
4. W Firebase Authentication włącz Google i dodaj domenę `testrekrut.pl` do Authorized domains. W ustawieniach OAuth upewnij się, że dozwolone są właściwe domeny.
5. W Resend zweryfikuj domenę nadawczą i skonfiguruj rekordy DNS. Ustaw sekret `RESEND_API_KEY` dopiero po weryfikacji domeny.
6. Wykonaj testy na zamówieniu testowym: utworzenie, odrzucenie nieuprawnionego administratora, potwierdzenie, kod w `accessCodes`, aktywacja w SG, e-mail, ponowna wysyłka tego samego kodu, podwójne kliknięcie.

## Istotny schemat kodu SG
Kod tworzony przez backend ma pola:
- `active: true`
- `product: "sg"`
- `createdAt`
- `orderId`, `orderNumber`, `email`

Celowo nie ma `userId`: obecny moduł SG pozwala pobrać aktywny kod, jeśli `userId` jest nieustawione, a następnie przypisać go do UID podczas aktywacji. Nie zmienia to istniejącego procesu aktywacji.

## Płatność
Kwota: 49,99 PLN. Metoda: BLIK/przelew ręczny. Tytuł: numer zamówienia `TR-ROK-NNNNN`. Administrator ma ręcznie sprawdzić wpływ i dopiero potem kliknąć „Potwierdź wpłatę”.

## Bezpieczeństwo i dane
- Kod jest tworzony wyłącznie w Cloud Functions, nie w przeglądarce.
- Funkcje administracyjne weryfikują zweryfikowany e-mail `testrekrut.pl@gmail.com`.
- Odczyt zamówień i operacje na kodach odbywają się przez Admin SDK; nie trzeba otwierać reguł Firestore.
- Wysyłka e-mail odbywa się po zapisaniu płatności i kodu. Jeśli dostawca e-mail zwróci błąd, zamówienie pozostaje opłacone, a panel pozwala wysłać ponownie ten sam kod.
- Firebase Admin SDK omija Firestore Security Rules; dlatego autoryzacja administratora jest obowiązkowa w każdej funkcji administracyjnej.
