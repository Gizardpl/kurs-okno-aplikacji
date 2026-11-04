#!/usr/bin/env node
'use strict';
// Najnowsza wersja aplikacji z udokumentowanego adresu instalatora producenta: adres odpowiada przekierowaniem, a
// nagłówek Location zawiera numer wersji (installation.md, „Offline installation”). Zwykłe zapytanie, bez podążania
// za przekierowaniem. Odpowiedź inna niż przekierowanie (np. 403) kończy przebieg czytelnym błędem.
// Użycie: node wersja/wersja.js  -> wypisuje JSON { wersja, adres, status }; w GitHub Actions dopisuje wyjścia kroku.
const fs = require('node:fs');

const ADRES = 'https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect';
const BLAD_OCHRONY = 'oficjalny adres instalatora wymaga przeglądarki albo ochrony przed botami';

/** Numer wersji z adresu przekierowania (pierwsza liczba w formacie a.b.c). */
function wersjaZAdresu(adres) {
  const m = /(?:^|[/_-])(\d+\.\d+\.\d+)(?=[/._-]|$)/.exec(String(adres || ''));
  return m ? m[1] : null;
}

/** Ocena odpowiedzi adresu instalatora: { wersja, adres } albo błąd z kodem odpowiedzi. */
function ocenOdpowiedz(status, location) {
  if (status === 403 || status === 429 || status === 503) throw new Error(`${BLAD_OCHRONY} (HTTP ${status} z ${ADRES})`);
  if (status < 300 || status >= 400 || !location) throw new Error(`adres instalatora nie przekierował (HTTP ${status})`);
  const wersja = wersjaZAdresu(location);
  if (!wersja) throw new Error(`brak numeru wersji w przekierowaniu: ${location}`);
  return { wersja, adres: location, status };
}

async function sprawdzWersje() {
  const odp = await fetch(ADRES, { method: 'GET', redirect: 'manual' });
  return ocenOdpowiedz(odp.status, odp.headers.get('location'));
}

if (require.main === module) {
  sprawdzWersje().then((w) => {
    console.log(JSON.stringify(w));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `wersja=${w.wersja}\nadres=${w.adres}\n`);
  }).catch((e) => {
    console.error(`::error::${e.message}`);
    process.exitCode = 1;
  });
}

module.exports = { wersjaZAdresu, ocenOdpowiedz, ADRES, BLAD_OCHRONY };
