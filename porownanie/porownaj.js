#!/usr/bin/env node
'use strict';
// Porównanie zrzutów okna z poprzednim przebiegiem. Wejście: dwa katalogi przebiegów (meta.json + zrzuty/*.png).
// Wyjście: raport.json (wejście dla agenta poprawiającego komponent okna), raport.md (dla człowieka) i obrazy
// przed/po/różnica dla każdego stanu ze zmianami.
// Użycie: node porownanie/porownaj.js --po <kat> [--przed <kat>] --wyjscie <kat> [--zamaluj "stan:x,y,w,h;…"]
const fs = require('node:fs');
const path = require('node:path');
const pixelmatch = require('pixelmatch');
const { czytajPng, zapiszPng, zamaluj, obrazRoznicy, parsujZamalowania } = require('./obrazy');
const { prostokaty } = require('./regiony');
const { opisMarkdown } = require('./raport-md');

const PROG_KOLORU = 0.1; // pixelmatch: czułość na różnicę koloru (0..1)
const MIN_PIKSELI = 12; // mniejsze skupiska (np. migający kursor tekstowy) to szum, wypisany osobno

const czytajMeta = (kat) => JSON.parse(fs.readFileSync(path.join(kat, 'meta.json'), 'utf8'));
const wPrzypadku = (plik) => (fs.existsSync(plik) ? czytajPng(plik) : null);

function maskaRoznic(przed, po, maski) {
  const { width: w, height: h } = po;
  const wyjscie = Buffer.alloc(w * h * 4);
  pixelmatch(przed.data, po.data, wyjscie, w, h, { threshold: PROG_KOLORU, includeAA: false, diffMask: true });
  const maska = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p += 1) maska[p] = wyjscie[p * 4 + 3] > 0 ? 1 : 0;
  for (const m of maski) {
    for (let y = Math.max(0, m.y); y < Math.min(h, m.y + m.h); y += 1) for (let x = Math.max(0, m.x); x < Math.min(w, m.x + m.w); x += 1) maska[y * w + x] = 0;
  }
  return maska;
}

function porownajStan({ stan, przedKat, poKat, wyjscie, zamalowania }) {
  const wynik = { stan: stan.stan, opis: stan.opis || '', status: 'bez-zmian', prostokaty: [], szum: 0 };
  const po = wPrzypadku(path.join(poKat, stan.plik));
  const plikPrzed = przedKat ? path.join(przedKat, `zrzuty/${stan.stan}.png`) : null;
  const przed = plikPrzed ? wPrzypadku(plikPrzed) : null;
  if (!po) return { ...wynik, status: 'brak-zrzutu' };
  const zapisz = (nazwa, obraz) => { const rel = `stany/${stan.stan}/${nazwa}.png`; zapiszPng(path.join(wyjscie, rel), obraz); return rel; };
  wynik.po = zapisz('po', po);
  wynik.rozmiar = { w: po.width, h: po.height };
  if (!przed) return { ...wynik, status: 'nowy' };
  for (const r of zamalowania[stan.stan] || []) zamaluj(przed, r, [255, 0, 255, 255]);
  wynik.przed = zapisz('przed', przed);
  if (przed.width !== po.width || przed.height !== po.height) {
    return { ...wynik, status: 'inny-rozmiar', rozmiarPrzed: { w: przed.width, h: przed.height }, prostokaty: [{ x: 0, y: 0, w: po.width, h: po.height, piksele: po.width * po.height }] };
  }
  const maska = maskaRoznic(przed, po, stan.maski || []);
  const wszystkie = prostokaty(maska, po.width, po.height);
  wynik.prostokaty = wszystkie.filter((p) => p.piksele >= MIN_PIKSELI);
  wynik.szum = wszystkie.length - wynik.prostokaty.length;
  if (!wynik.prostokaty.length) return wynik;
  wynik.status = 'zmiany';
  wynik.procent = Number(((100 * wynik.prostokaty.reduce((s, p) => s + p.piksele, 0)) / (po.width * po.height)).toFixed(3));
  wynik.roznica = zapisz('roznica', obrazRoznicy(po, maska, wynik.prostokaty));
  return wynik;
}

/** @returns {object} raport (zapisany też jako raport.json i raport.md w katalogu wyjścia) */
function porownajKatalogi({ przed, po, wyjscie, zamaluj: zamal = '' }) {
  const zamalowania = parsujZamalowania(zamal);
  const metaPo = czytajMeta(po);
  const metaPrzed = przed && fs.existsSync(path.join(przed, 'meta.json')) ? czytajMeta(przed) : null;
  const przedKat = metaPrzed ? przed : null;
  fs.mkdirSync(wyjscie, { recursive: true });
  const stany = metaPo.stany.map((s) => porownajStan({ stan: s, przedKat, poKat: po, wyjscie, zamalowania }));
  if (metaPrzed) {
    for (const s of metaPrzed.stany.filter((p) => !metaPo.stany.some((n) => n.stan === p.stan))) {
      stany.push({ stan: s.stan, opis: s.opis || '', status: 'brak-w-nowym', prostokaty: [] });
    }
  }
  // Przy istniejącym wzorcu nowy stan też jest różnicą (wzorzec go nie miał), żeby raport nie mówił „0 różnic”.
  const rozne = ['zmiany', 'inny-rozmiar', 'brak-w-nowym', 'brak-zrzutu', ...(metaPrzed ? ['nowy'] : [])];
  const liczbaRoznic = stany.filter((s) => rozne.includes(s.status)).length;
  const raport = {
    wersjaPrzed: metaPrzed ? metaPrzed.wersja : null,
    wersjaPo: metaPo.wersja,
    przebiegPrzed: metaPrzed ? metaPrzed.przebieg || null : null,
    przebiegPo: metaPo.przebieg || null,
    zamalowaneWzorce: zamalowania,
    liczbaRoznic,
    wniosek: !metaPrzed ? 'brak punktu odniesienia' : liczbaRoznic ? `${liczbaRoznic} różnic` : '0 różnic',
    jednostka: 'piksele zrzutu (skala ekranu w meta.json przebiegu)',
    stany,
  };
  fs.writeFileSync(path.join(wyjscie, 'raport.json'), `${JSON.stringify(raport, null, 2)}\n`);
  fs.writeFileSync(path.join(wyjscie, 'raport.md'), opisMarkdown(raport));
  return raport;
}

if (require.main === module) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const przed = arg('--przed');
  const raport = porownajKatalogi({ przed: przed && fs.existsSync(przed) ? przed : null, po: arg('--po'), wyjscie: arg('--wyjscie'), zamaluj: arg('--zamaluj') || '' });
  console.log(`Wynik porównania: ${raport.wniosek} (wersja ${raport.wersjaPrzed || '-'} -> ${raport.wersjaPo})`);
}

module.exports = { porownajKatalogi, porownajStan, MIN_PIKSELI };
