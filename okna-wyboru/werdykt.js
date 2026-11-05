'use strict';
// Werdykt przebiegu okna wyboru: sukces tylko wtedy, gdy każdy krok i zrzut zgłosił „ok”, okno zwróciło folder „notes”, a
// zwrócona ścieżka to naprawdę Pulpit/notes i folder tam istnieje. Same „ok” kroków nie wystarczą: klawisze wysłane do innego
// okna też kończą się bez błędu (Windows 11, ekran pierwszego uruchomienia), a wtedy przebieg ma się nie udać, żeby ruszył
// obraz zapasowy.
const path = require('node:path');

const FOLDER = 'notes';

/** Ta sama ścieżka; na Windows bez rozróżniania wielkości liter. */
const tenSam = (a, b, platforma) => {
  const n = (p) => (platforma === 'win32' ? path.win32.resolve(p).toLowerCase() : path.posix.resolve(p));
  return n(a) === n(b);
};

/**
 * @param wynik kroki → „ok” albo błąd, oraz „wybrany folder” (sama nazwa)
 * @param okno { wybrana: pełna ścieżka zwrócona przez okno albo null, pulpit: ścieżka Pulpitu, istnieje: czy Pulpit/notes jest, platforma }
 * @returns {{ kod: 0 | 1, powody: string[] }}
 */
function werdykt(wynik, { wybrana, pulpit, istnieje, platforma }) {
  const powody = [];
  for (const [k, w] of Object.entries(wynik)) if (k !== 'wybrany folder' && w !== 'ok') powody.push(`${k}: ${w}`);
  if (wynik['wybrany folder'] !== FOLDER) powody.push(`wybrany folder: ${wynik['wybrany folder'] || 'okno się nie zamknęło'}`);
  const cel = (platforma === 'win32' ? path.win32 : path.posix).join(pulpit, FOLDER);
  if (!wybrana || !tenSam(wybrana, cel, platforma)) powody.push(`wybrana ścieżka to nie ${FOLDER} na Pulpicie`);
  if (!istnieje) powody.push(`na Pulpicie nie ma folderu ${FOLDER}`);
  return { kod: powody.length ? 1 : 0, powody };
}

module.exports = { werdykt, FOLDER };
