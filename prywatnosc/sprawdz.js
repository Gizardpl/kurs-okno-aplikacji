#!/usr/bin/env node
'use strict';
// Kontrola prywatności zrzutów: OCR (tesseract) każdego PNG, zapis tekstu i szukanie e-maili oraz słów zakazanych.
// Kończy się kodem 1 przy trafieniu, braku tesseracta albo braku zrzutów (bez cichego przejścia).
// Użycie: node prywatnosc/sprawdz.js --zrzuty <kat> --wyjscie <kat> [--slowa <plik, jedno słowo w linii>]
//         node prywatnosc/sprawdz.js --teksty <kat z .txt/.log/.json/.jsonl> --wyjscie <kat> [--slowa <plik>]   (bez OCR)
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { znajdzTrafienia } = require('./wzorce');

function zbierz(kat, rozszerzenia) {
  const wynik = [];
  const idz = (k) => {
    for (const w of fs.readdirSync(k, { withFileTypes: true })) {
      const p = path.join(k, w.name);
      if (w.isDirectory()) idz(p);
      else if (rozszerzenia.some((r) => w.name.endsWith(r))) wynik.push(p);
    }
  };
  if (fs.existsSync(kat)) idz(kat);
  return wynik.sort();
}

/** Pliki tekstowe sprawdzane bez OCR: tekst z OCR, logi aplikacji, drzewo dostępności, dziennik atrapy bramki. */
const TEKSTOWE = ['.txt', '.log', '.json', '.jsonl'];

const ocr = (plik) => execFileSync('tesseract', [plik, 'stdout', '--psm', '3'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** @returns {{ pliki: number, trafienia: object[] }} */
function sprawdz({ zrzuty, teksty, wyjscie, slowa = [] }) {
  fs.mkdirSync(path.join(wyjscie, 'ocr'), { recursive: true });
  const wejscie = teksty ? zbierz(teksty, TEKSTOWE) : zbierz(zrzuty, ['.png']);
  if (!wejscie.length) throw new Error('brak plików do sprawdzenia');
  const trafienia = [];
  for (const plik of wejscie) {
    const baza = teksty ? teksty : zrzuty;
    const rel = path.relative(baza, plik).split(path.sep).join('/');
    const tekst = teksty ? fs.readFileSync(plik, 'utf8') : ocr(plik);
    if (!teksty) {
      const cel = path.join(wyjscie, 'ocr', rel.replace(/\.png$/, '.txt'));
      fs.mkdirSync(path.dirname(cel), { recursive: true });
      fs.writeFileSync(cel, tekst);
    }
    for (const t of znajdzTrafienia(tekst, { slowa })) trafienia.push({ plik: rel, ...t });
  }
  const wynik = { pliki: wejscie.length, trafienia, wniosek: trafienia.length ? `${trafienia.length} trafień` : '0 trafień' };
  fs.writeFileSync(path.join(wyjscie, 'prywatnosc.json'), `${JSON.stringify(wynik, null, 2)}\n`);
  return wynik;
}

if (require.main === module) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const plikSlow = arg('--slowa');
  const slowa = plikSlow ? fs.readFileSync(plikSlow, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
  try {
    const w = sprawdz({ zrzuty: arg('--zrzuty'), teksty: arg('--teksty'), wyjscie: arg('--wyjscie'), slowa });
    console.log(`Kontrola prywatności: ${w.pliki} plików, ${w.wniosek}`);
    for (const t of w.trafienia) console.log(`- ${t.plik}, linia ${t.linia}: ${t.wzorzec} (${t.fragment})`);
    process.exitCode = w.trafienia.length ? 1 : 0;
  } catch (e) {
    console.error(`BŁĄD kontroli prywatności: ${e.message}`);
    process.exitCode = 1;
  }
}

module.exports = { sprawdz };
