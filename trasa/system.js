'use strict';
// Sterowanie macOS zwykłymi narzędziami systemu: osascript (System Events, CoreGraphics), screencapture, open.
// Jedyne miejsce, które uruchamia programy systemu; reszta trasy dostaje ten obiekt (testy podają atrapę).
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const JXA = path.join(__dirname, 'jxa');

function jxa(skrypt, args = [], timeoutS = 120) {
  return execFileSync('osascript', ['-l', 'JavaScript', path.join(JXA, `${skrypt}.js`), ...args.map(String)], {
    encoding: 'utf8', timeout: timeoutS * 1000, maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

const json = (tekst) => JSON.parse(tekst);

const system = {
  uruchomAplikacje: (sciezka) => execFileSync('open', ['-a', sciezka]),
  okno: (proces, granice) => json(jxa('okno', granice ? [proces, granice.x, granice.y, granice.w, granice.h] : [proces])),
  drzewo: (proces, maxG = 40, maxW = 2500) => json(jxa('drzewo', [proces, maxG, maxW], 300)),
  dostepnosc: (proces) => json(jxa('dostepnosc', [proces])),
  ekran: () => json(jxa('ekran')),
  mysz: (rodzaj, x, y) => jxa('mysz', [rodzaj, Math.round(x), Math.round(y)]),
  klawisze: (opis) => jxa('klawisze', [JSON.stringify(opis)]),
  menu: (proces, sciezka) => jxa('menu', [proces, JSON.stringify(sciezka)]),
  zrzutObszaru: (plik, { x, y, w, h }) => execFileSync('screencapture', ['-x', '-t', 'png', `-R${x},${y},${w},${h}`, plik]),
  zrzutEkranu: (plik) => execFileSync('screencapture', ['-x', '-t', 'png', plik]),
  /**
   * Nagranie całego ekranu (screencapture -v nagrywa, aż dostanie dowolny znak na wejściu); zwraca funkcję kończącą:
   * znak na wejście, po 10 s SIGINT, po 40 s SIGKILL. Wynik: czy proces zakończył się sam.
   */
  nagrywaj: (plik) => {
    const p = spawn('screencapture', ['-x', '-v', plik], { stdio: ['pipe', 'ignore', 'ignore'] });
    let koniec = false;
    p.on('exit', () => { koniec = true; });
    return () => new Promise((ok) => {
      if (koniec) { ok(false); return; }
      const sygnal = setTimeout(() => p.kill('SIGINT'), 10000);
      const limit = setTimeout(() => { p.kill('SIGKILL'); ok(false); }, 40000);
      p.on('exit', () => { clearTimeout(sygnal); clearTimeout(limit); ok(true); });
      try { p.stdin.write('q\n'); p.stdin.end(); } catch { /* proces mógł się już zakończyć */ }
    });
  },
};

module.exports = { system };
