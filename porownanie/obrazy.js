'use strict';
// Odczyt, zapis i proste operacje na obrazach PNG (pngjs, wersja przypięta w package-lock.json).
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const czytajPng = (plik) => PNG.sync.read(fs.readFileSync(plik));

function zapiszPng(plik, obraz) {
  fs.mkdirSync(path.dirname(plik), { recursive: true });
  const png = new PNG({ width: obraz.width, height: obraz.height });
  obraz.data.copy ? obraz.data.copy(png.data) : png.data.set(obraz.data);
  fs.writeFileSync(plik, PNG.sync.write(png));
}

function nowyObraz(width, height, kolor = [0, 0, 0, 255]) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(kolor, i);
  return { width, height, data };
}

/** Wypełnia prostokąt kolorem (przycięty do obrazu). */
function zamaluj(obraz, { x, y, w, h }, kolor) {
  for (let yy = Math.max(0, y); yy < Math.min(obraz.height, y + h); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(obraz.width, x + w); xx += 1) obraz.data.set(kolor, (yy * obraz.width + xx) * 4);
  }
}

/** Obrys prostokąta o grubości 2 px. */
function obrysuj(obraz, { x, y, w, h }, kolor) {
  zamaluj(obraz, { x: x - 2, y: y - 2, w: w + 4, h: 2 }, kolor);
  zamaluj(obraz, { x: x - 2, y: y + h, w: w + 4, h: 2 }, kolor);
  zamaluj(obraz, { x: x - 2, y: y - 2, w: 2, h: h + 4 }, kolor);
  zamaluj(obraz, { x: x + w, y: y - 2, w: 2, h: h + 4 }, kolor);
}

/**
 * Obraz różnicy: szary, przyciemniony obraz „po”, zmienione piksele na czerwono, prostokąty w obrysie.
 * @param {Uint8Array} maska
 */
function obrazRoznicy(po, maska, prostokaty) {
  const wynik = { width: po.width, height: po.height, data: Buffer.alloc(po.data.length) };
  for (let i = 0, p = 0; i < po.data.length; i += 4, p += 1) {
    if (maska[p]) { wynik.data.set([255, 40, 40, 255], i); continue; }
    const szary = Math.round((0.299 * po.data[i] + 0.587 * po.data[i + 1] + 0.114 * po.data[i + 2]) * 0.45);
    wynik.data.set([szary, szary, szary, 255], i);
  }
  for (const p of prostokaty) obrysuj(wynik, p, [255, 0, 255, 255]);
  return wynik;
}

/** Parametr zamalowania wzorca: „stan:x,y,w,h;stan:x,y,w,h”. */
function parsujZamalowania(tekst) {
  const wynik = {};
  for (const czesc of String(tekst || '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const m = /^([\w-]+):(\d+),(\d+),(\d+),(\d+)$/.exec(czesc.replace(/\s+/g, ''));
    if (!m) throw new Error(`zły parametr zamaluj: „${czesc}” (wzór: stan:x,y,w,h)`);
    (wynik[m[1]] = wynik[m[1]] || []).push({ x: +m[2], y: +m[3], w: +m[4], h: +m[5] });
  }
  return wynik;
}

module.exports = { czytajPng, zapiszPng, nowyObraz, zamaluj, obrazRoznicy, parsujZamalowania };
