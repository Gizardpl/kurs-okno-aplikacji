'use strict';
// Wybór gotowej odpowiedzi atrapy na podstawie zapytania aplikacji. Treści są zmyślone i stałe, żeby kolejne
// przebiegi dawały ten sam obraz okna. Scenariusz: bramka/scenariusz.json.
const { noweId } = require('./sse');

/** Tekst bloku albo listy bloków treści (string | [{type:'text',text}|...]). */
function tekstTresci(tresc) {
  if (typeof tresc === 'string') return tresc;
  if (!Array.isArray(tresc)) return '';
  return tresc.filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
}

const maWynikNarzedzia = (wiadomosc) => Array.isArray(wiadomosc && wiadomosc.content) && wiadomosc.content.some((b) => b && b.type === 'tool_result');

/** Katalog roboczy sesji z promptu systemowego (Claude Code podaje go jako „Working directory: …”). */
function katalogRoboczy(system) {
  const tekst = Array.isArray(system) ? system.map((b) => b.text || '').join('\n') : String(system || '');
  const m = /(?:Working directory|Primary working directory|cwd)\s*:\s*(\S+)/i.exec(tekst);
  return m ? m[1] : '.';
}

function podstaw(wartosc, zmienne) {
  if (typeof wartosc === 'string') return wartosc.replace(/\{(\w+)\}/g, (c, n) => (n in zmienne ? zmienne[n] : c));
  if (Array.isArray(wartosc)) return wartosc.map((w) => podstaw(w, zmienne));
  if (wartosc && typeof wartosc === 'object') return Object.fromEntries(Object.entries(wartosc).map(([k, w]) => [k, podstaw(w, zmienne)]));
  return wartosc;
}

const tekst = (t) => [{ type: 'text', text: t }];

/**
 * @returns {{ rodzaj: string, bloki: object[] }}
 */
function wybierzOdpowiedz(zapytanie, scenariusz) {
  const wiadomosci = zapytanie.messages || [];
  const ostatnia = wiadomosci[wiadomosci.length - 1];
  const narzedzia = (zapytanie.tools || []).map((t) => t.name);
  const system = Array.isArray(zapytanie.system) ? zapytanie.system.map((b) => b.text || '').join('\n') : String(zapytanie.system || '');

  if (!narzedzia.length) {
    const calosc = `${system}\n${wiadomosci.map((w) => tekstTresci(w.content)).join('\n')}`;
    if (/isNewTopic/.test(calosc)) return { rodzaj: 'temat', bloki: tekst(JSON.stringify({ isNewTopic: true, title: scenariusz.tytul })) };
    return { rodzaj: 'poboczne', bloki: tekst(scenariusz.tytul) };
  }
  if (maWynikNarzedzia(ostatnia)) return { rodzaj: 'po-narzedziu', bloki: tekst(scenariusz.poNarzedziu) };

  const pytanie = tekstTresci(ostatnia && ostatnia.content).toLowerCase();
  const zasada = scenariusz.zasady.find((z) => pytanie.includes(z.gdy.toLowerCase()));
  if (!zasada) return { rodzaj: 'domyslna', bloki: tekst(scenariusz.domyslna) };
  if (zasada.tekst) return { rodzaj: `tekst:${zasada.gdy}`, bloki: tekst(zasada.tekst) };
  if (!narzedzia.includes(zasada.narzedzie)) return { rodzaj: `brak-narzedzia:${zasada.narzedzie}`, bloki: tekst(scenariusz.domyslna) };
  const wejscie = podstaw(zasada.wejscie, { katalog: katalogRoboczy(zapytanie.system) });
  const bloki = zasada.wstep ? tekst(zasada.wstep) : [];
  bloki.push({ type: 'tool_use', id: noweId('toolu'), name: zasada.narzedzie, input: wejscie });
  return { rodzaj: `narzedzie:${zasada.narzedzie}`, bloki };
}

module.exports = { wybierzOdpowiedz, tekstTresci, katalogRoboczy };
