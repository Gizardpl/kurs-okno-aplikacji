'use strict';
// Wzorce danych, które nie mogą pojawić się na zrzutach: adresy e-mail i słowa zakazane (np. nazwy kont).
// Repo publiczne zna tylko wzorce ogólne; słowa zakazane podaje ten, kto uruchamia kontrolę (plik poza repo).

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const bezZnakow = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();
const zakryj = (t) => `${t[0]}${'*'.repeat(Math.max(0, t.length - 1))}`;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} tekst tekst odczytany z jednego zrzutu
 * @param {{ slowa?: string[] }} opcje
 * @returns {{ wzorzec: string, linia: number, fragment: string }[]}
 */
function znajdzTrafienia(tekst, { slowa = [] } = {}) {
  const wynik = [];
  const linie = String(tekst).split(/\r?\n/);
  const wzorceSlow = slowa.filter((s) => s && s.trim().length >= 3).map((s) => ({ slowo: s.trim(), re: new RegExp(`(^|[^a-z0-9])${escape(bezZnakow(s.trim()))}($|[^a-z0-9])`) }));
  linie.forEach((linia, i) => {
    for (const m of linia.matchAll(EMAIL)) wynik.push({ wzorzec: 'e-mail', linia: i + 1, fragment: zakryj(m[0]) });
    const prosta = bezZnakow(linia);
    wzorceSlow.forEach((w, k) => { if (w.re.test(prosta)) wynik.push({ wzorzec: `słowo zakazane nr ${k + 1}`, linia: i + 1, fragment: zakryj(w.slowo) }); });
  });
  return wynik;
}

module.exports = { znajdzTrafienia, zakryj };
