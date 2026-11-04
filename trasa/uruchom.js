#!/usr/bin/env node
'use strict';
// Przejście stałej trasy stanów okna aplikacji: zrzuty stanów, nagranie ekranu, diagnostyka i meta.json.
// Użycie (macOS): node trasa/uruchom.js --trasa trasa/trasa.json --wyjscie <kat> --aplikacja /Applications/Claude.app
//                 --proces Claude --wersja <x> [--wersja-aplikacji <x>] --przebieg <adres> [--nagranie <plik.mov>]
const fs = require('node:fs');
const path = require('node:path');
const { wykonajKrok } = require('./kroki');

/**
 * Wynik trasy: udana tylko wtedy, gdy nie przerwano jej i powstały wszystkie oczekiwane stany. Niepełna trasa nie może
 * zostać punktem odniesienia, bo kolejne porównanie pokazałoby „0 różnic” bez porównania brakujących stanów.
 */
function wynikTrasy(meta, trasa) {
  const brakujace = (trasa.oczekiwaneStany || []).filter((s) => !meta.stany.some((x) => x.stan === s));
  return { ok: !meta.przerwana && meta.stany.length > 0 && !brakujace.length, brakujace };
}

async function przejdzTrase({ trasa, wyjscie, aplikacja, proces, wersja, wersjaAplikacji = null, przebieg, nagranie, system }) {
  for (const kat of ['zrzuty', 'diagnostyka']) fs.mkdirSync(path.join(wyjscie, kat), { recursive: true });
  const meta = { wersja, wersjaAplikacji, przebieg, data: new Date().toISOString(), stany: [], kroki: [], bledy: [] };
  const k = { system, proces, aplikacja, wyjscie, meta, stan: {} };
  const zakonczNagranie = nagranie ? system.nagrywaj(nagranie) : null;
  let przerwana = false;
  try {
    trasa.kroki.forEach((krok, nr) => {
      if (przerwana) return;
      const start = Date.now();
      const wpis = { nr: nr + 1, krok: krok.krok, opis: krok.opis || krok.stan || krok.tekst || krok.nazwa || '' };
      try {
        Object.assign(wpis, wykonajKrok(k, krok));
      } catch (e) {
        wpis.blad = String(e.message).split('\n')[0].slice(0, 300);
        meta.bledy.push({ nr: wpis.nr, krok: krok.krok, blad: wpis.blad, opcjonalny: Boolean(krok.opcjonalny) });
        if (!krok.opcjonalny) przerwana = true;
      }
      wpis.ms = Date.now() - start;
      meta.kroki.push(wpis);
      console.log(`${String(wpis.nr).padStart(2)} ${wpis.krok.padEnd(10)} ${wpis.blad ? `BŁĄD ${wpis.blad}` : wpis.wynik}`);
    });
  } finally {
    if (zakonczNagranie) meta.nagranie = (await zakonczNagranie()) ? path.basename(nagranie) : 'nagranie przerwane';
    meta.ekran = k.stan.ekran || null;
    meta.przerwana = przerwana;
    fs.writeFileSync(path.join(wyjscie, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  }
  return meta;
}

if (require.main === module) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const { system } = require('./system');
  const trasa = JSON.parse(fs.readFileSync(arg('--trasa'), 'utf8'));
  przejdzTrase({
    trasa, wyjscie: arg('--wyjscie'), aplikacja: arg('--aplikacja'), proces: arg('--proces'), wersja: arg('--wersja'), wersjaAplikacji: arg('--wersja-aplikacji'),
    przebieg: arg('--przebieg'), nagranie: arg('--nagranie'), system,
  }).then((meta) => {
    const w = wynikTrasy(meta, trasa);
    console.log(`Stany: ${meta.stany.map((s) => s.stan).join(', ') || '(brak)'}; błędy: ${meta.bledy.length}`);
    if (w.brakujace.length) console.error(`Brak oczekiwanych stanów: ${w.brakujace.join(', ')} (zrzuty nie zostaną wzorcem)`);
    process.exitCode = w.ok ? 0 : 1;
  }).catch((e) => { console.error(`BŁĄD trasy: ${e.message}`); process.exitCode = 1; });
}

module.exports = { przejdzTrase, wynikTrasy };
