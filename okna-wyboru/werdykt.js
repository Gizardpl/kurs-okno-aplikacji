'use strict';
// Werdykt przebiegu okna wyboru: sukces tylko wtedy, gdy każdy krok i zrzut zgłosił „ok”, okno zwróciło folder „notes”, a
// folder naprawdę powstał na Pulpicie. Same „ok” kroków nie wystarczą: klawisze wysłane do innego okna też kończą się bez
// błędu (Windows 11, ekran pierwszego uruchomienia), a wtedy przebieg ma się nie udać, żeby ruszył obraz zapasowy.
const FOLDER = 'notes';

/** @returns {{ kod: 0 | 1, powody: string[] }} */
function werdykt(wynik, folderIstnieje) {
  const powody = [];
  for (const [k, w] of Object.entries(wynik)) if (k !== 'wybrany folder' && w !== 'ok') powody.push(`${k}: ${w}`);
  if (wynik['wybrany folder'] !== FOLDER) powody.push(`wybrany folder: ${wynik['wybrany folder'] || 'okno się nie zamknęło'}`);
  if (!folderIstnieje) powody.push(`wybrany folder to nie ${FOLDER} na Pulpicie albo go tam nie ma`);
  return { kod: powody.length ? 1 : 0, powody };
}

module.exports = { werdykt, FOLDER };
