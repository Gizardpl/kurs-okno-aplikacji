'use strict';
// Krótki raport różnic dla człowieka (Markdown, także podsumowanie przebiegu w GitHub Actions).

const STATUSY = {
  'bez-zmian': 'bez zmian',
  zmiany: 'ZMIANY',
  nowy: 'nowy stan (brak wzorca)',
  'inny-rozmiar': 'INNY ROZMIAR ZRZUTU',
  'brak-w-nowym': 'BRAK W NOWYM PRZEBIEGU',
  'brak-zrzutu': 'BRAK ZRZUTU',
};

function opisMarkdown(r) {
  const linie = [
    '# Raport różnic okna aplikacji',
    '',
    `- Wersja: ${r.wersjaPrzed || '(brak wzorca)'} -> ${r.wersjaPo}`,
    `- Punkt odniesienia: ${r.przebiegPrzed || '(brak)'}`,
    `- Wynik: **${r.wniosek}**`,
  ];
  if (Object.keys(r.zamalowaneWzorce || {}).length) linie.push(`- Próba: zamalowany wzorzec ${JSON.stringify(r.zamalowaneWzorce)}`);
  linie.push('', '| Stan | Wynik | Miejsca (x, y, szer., wys.) | Obrazy |', '|---|---|---|---|');
  for (const s of r.stany) {
    const miejsca = s.prostokaty.slice(0, 6).map((p) => `${p.x},${p.y},${p.w},${p.h}`).join('; ') + (s.prostokaty.length > 6 ? `; … (+${s.prostokaty.length - 6})` : '');
    const obrazy = ['przed', 'po', 'roznica'].filter((k) => s[k]).map((k) => `\`${s[k]}\``).join(' ');
    linie.push(`| ${s.stan} | ${STATUSY[s.status] || s.status}${s.szum ? ` (szum: ${s.szum})` : ''} | ${miejsca || '-'} | ${obrazy || '-'} |`);
  }
  return `${linie.join('\n')}\n`;
}

module.exports = { opisMarkdown };
