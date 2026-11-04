'use strict';
// Wykonanie jednego kroku trasy (trasa.json). Kontekst `k` niesie sterowanie systemem (system.js albo atrapa w testach),
// katalog wyjścia i zbierane dane przebiegu (meta).
const fs = require('node:fs');
const path = require('node:path');
const { znajdzWezel, pasuje } = require('./wezly');

const KLAWISZE = { enter: 36, escape: 53, tab: 48, spacja: 49, gora: 126, dol: 125, lewo: 123, prawo: 124, g: 5, a: 0, n: 45, backspace: 51 };
const spij = (s) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.round(s * 1000));

function drzewo(k) {
  const d = k.system.drzewo(k.proces);
  return d.wezly || [];
}

/** Czeka, aż w drzewie pojawi się element pasujący do kryterium; zwraca węzeł albo rzuca błąd po czasie. */
function czekajNaWezel(k, kryterium, sekundy) {
  const koniec = Date.now() + sekundy * 1000;
  for (;;) {
    const w = znajdzWezel(drzewo(k), kryterium);
    if (w) return w;
    if (Date.now() > koniec) throw new Error(`nie pojawił się element: ${JSON.stringify(kryterium.tekst)}`);
    spij(1.5);
  }
}

/** Zrzut obszaru okna, gdy dwa kolejne zrzuty są identyczne (okno przestało się zmieniać), najwyżej `proby` razy. */
function stabilnyZrzut(k, plik, granice, proby = 10) {
  const tmpA = `${plik}.a.png`; const tmpB = `${plik}.b.png`;
  k.system.zrzutObszaru(tmpA, granice);
  let stabilny = false;
  for (let i = 0; i < proby && !stabilny; i += 1) {
    spij(0.8);
    k.system.zrzutObszaru(tmpB, granice);
    stabilny = fs.readFileSync(tmpA).equals(fs.readFileSync(tmpB));
    fs.renameSync(tmpB, tmpA);
  }
  fs.renameSync(tmpA, plik);
  return stabilny;
}

const wykonawcy = {
  uruchom(k, krok) {
    k.system.uruchomAplikacje(k.aplikacja);
    const koniec = Date.now() + (krok.s || 120) * 1000;
    for (;;) {
      let o = null;
      try { o = k.system.okno(k.proces); } catch { o = null; }
      if (o && !o.blad) { k.stan.okno = o; return `okno ${o.w}x${o.h} „${o.nazwa}”`; }
      if (Date.now() > koniec) throw new Error('okno aplikacji nie pojawiło się');
      spij(2);
    }
  },
  czekaj(k, krok) { spij(krok.s || 1); return `${krok.s || 1} s`; },
  dostepnosc(k) { return JSON.stringify(k.system.dostepnosc(k.proces)); },
  okno(k, krok) {
    const e = k.system.ekran();
    k.stan.ekran = e;
    const v = e.widoczny;
    const granice = { x: v.x, y: v.y, w: Math.min(krok.w || v.w, v.w), h: Math.min(krok.h || v.h, v.h) };
    k.stan.okno = k.system.okno(k.proces, granice);
    return `ekran ${e.w}x${e.h}@${e.skala}x, okno ${k.stan.okno.w}x${k.stan.okno.h}`;
  },
  drzewo(k, krok) {
    const d = k.system.drzewo(k.proces);
    fs.writeFileSync(path.join(k.wyjscie, 'diagnostyka', `drzewo-${krok.nazwa}.json`), JSON.stringify(d, null, 1));
    return `${(d.wezly || []).length} elementów${d.uciete ? ' (ucięte)' : ''}`;
  },
  ekran(k, krok) {
    k.system.zrzutEkranu(path.join(k.wyjscie, 'diagnostyka', `ekran-${krok.nazwa}.png`));
    return 'zrzut ekranu';
  },
  klik(k, krok) {
    const w = krok.czekaj ? czekajNaWezel(k, krok, krok.czekaj) : znajdzWezel(drzewo(k), krok);
    if (!w) throw new Error(`nie znaleziono elementu: ${JSON.stringify(krok.tekst)}`);
    k.system.mysz('klik', w.cx, w.cy);
    return `klik ${w.rola} „${w.nazwa || w.opis || w.tytul || w.wartosc}” (${w.cx}, ${w.cy})`;
  },
  klikXY(k, krok) {
    const o = k.system.okno(k.proces);
    k.system.mysz('klik', o.x + krok.x, o.y + krok.y);
    return `klik (${o.x + krok.x}, ${o.y + krok.y})`;
  },
  pisz(k, krok) { k.system.klawisze({ tekst: krok.tekst }); return `${krok.tekst.length} znaków`; },
  klawisz(k, krok) {
    const kod = KLAWISZE[krok.klucz];
    if (kod === undefined) throw new Error(`nieznany klawisz ${krok.klucz}`);
    k.system.klawisze({ kod, z: krok.z || [] });
    return `${(krok.z || []).join('+')}${krok.z ? '+' : ''}${krok.klucz}`;
  },
  menu(k, krok) { k.system.menu(k.proces, krok.sciezka); return krok.sciezka.join(' > '); },
  czekajNa(k, krok) { const w = czekajNaWezel(k, krok, krok.s || 30); return `jest „${w.nazwa || w.opis || w.tytul || w.wartosc}”`; },
  zrzut(k, krok) {
    const o = k.system.okno(k.proces);
    const e = k.stan.ekran || k.system.ekran();
    k.system.mysz('ruch', e.w - 2, e.h - 2);
    spij(krok.s === undefined ? 1 : krok.s);
    const plik = path.join(k.wyjscie, 'zrzuty', `${krok.stan}.png`);
    const stabilny = stabilnyZrzut(k, plik, { x: o.x, y: o.y, w: o.w, h: o.h });
    k.meta.stany = k.meta.stany.filter((s) => s.stan !== krok.stan);
    k.meta.stany.push({ stan: krok.stan, opis: krok.opis || '', plik: `zrzuty/${krok.stan}.png`, maski: krok.maski || [], stabilny, okno: o });
    return `${krok.stan}${stabilny ? '' : ' (okno nie przestało się zmieniać)'}`;
  },
};

/** Warunek „gdy”: krok wykonuje się tylko, gdy w oknie widać ten tekst. */
function warunekSpelniony(k, krok) {
  if (!krok.gdy) return true;
  return drzewo(k).some((w) => pasuje(w, { tekst: krok.gdy }));
}

function wykonajKrok(k, krok) {
  const wykonawca = wykonawcy[krok.krok];
  if (!wykonawca) throw new Error(`nieznany krok „${krok.krok}”`);
  if (!warunekSpelniony(k, krok)) return { pominiety: true, wynik: `pominięty: brak „${krok.gdy}”` };
  return { wynik: wykonawca(k, krok) };
}

module.exports = { wykonajKrok, wykonawcy, KLAWISZE };
