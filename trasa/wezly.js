'use strict';
// Szukanie elementu okna w płaskim drzewie dostępności (wynik jxa/drzewo.js). Bez zależności od systemu.

const POLA = ['nazwa', 'opis', 'tytul', 'wartosc'];
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Czy węzeł pasuje do jednego z tekstów (dokładnie albo jako fragment) i opcjonalnie do roli. */
function pasuje(wezel, { tekst, rola, dokladnie = false }) {
  if (rola && wezel.rola !== rola) return false;
  const teksty = (Array.isArray(tekst) ? tekst : [tekst]).map(norm).filter(Boolean);
  return POLA.some((p) => {
    const v = norm(wezel[p]);
    return v && teksty.some((t) => (dokladnie ? v === t : v.includes(t)));
  });
}

const widoczny = (w) => Number.isFinite(w.x) && w.w > 0 && w.h > 0;

/**
 * Najlepiej pasujący widoczny węzeł: najpierw dokładne dopasowanie, potem najmniejszy element (np. przycisk zamiast
 * całego panelu, w którym leży napis). Zwraca węzeł ze środkiem { cx, cy } albo null.
 */
function znajdzWezel(wezly, kryterium) {
  const kandydaci = wezly.filter((w) => widoczny(w) && pasuje(w, kryterium));
  if (!kandydaci.length) return null;
  const dokladne = kandydaci.filter((w) => pasuje(w, { ...kryterium, dokladnie: true }));
  const pula = dokladne.length ? dokladne : kandydaci;
  const najmniejszy = pula.reduce((a, b) => (b.w * b.h < a.w * a.h ? b : a));
  return { ...najmniejszy, cx: Math.round(najmniejszy.x + najmniejszy.w / 2), cy: Math.round(najmniejszy.y + najmniejszy.h / 2) };
}

/** Teksty widoczne w drzewie (do dziennika i do warunku „gdy”). */
const tekstyDrzewa = (wezly) => wezly.flatMap((w) => POLA.map((p) => w[p]).filter((v) => typeof v === 'string' && v.trim()));

module.exports = { znajdzWezel, pasuje, tekstyDrzewa };
