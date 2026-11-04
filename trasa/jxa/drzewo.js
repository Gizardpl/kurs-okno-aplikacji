// JXA: drzewo dostępności (Accessibility) wszystkich okien procesu, płasko, z położeniem elementów.
// Zwykłe API systemu (System Events), bez narzędzi deweloperskich aplikacji.
// Użycie: osascript -l JavaScript drzewo.js <proces> <maxGlebokosc> <maxWezlow>
function run(argv) {
  const se = Application('System Events');
  const proces = se.processes.byName(argv[0]);
  const maxG = Number(argv[1] || 30);
  const maxW = Number(argv[2] || 2500);
  const wezly = [];
  const bezpiecznie = (f) => { try { const v = f(); return v === null || v === undefined ? '' : v; } catch (e) { return ''; } };
  const krotko = (v) => (typeof v === 'string' ? v.slice(0, 200) : '');
  function idz(el, glebokosc, sciezka) {
    if (wezly.length >= maxW || glebokosc > maxG) return;
    const poz = bezpiecznie(() => el.position());
    const roz = bezpiecznie(() => el.size());
    const wezel = {
      s: sciezka,
      rola: bezpiecznie(() => el.role()),
      nazwa: krotko(bezpiecznie(() => el.name())),
      opis: krotko(bezpiecznie(() => el.description())),
      tytul: krotko(bezpiecznie(() => el.title())),
      wartosc: krotko(bezpiecznie(() => el.value())),
    };
    if (poz && roz) { wezel.x = poz[0]; wezel.y = poz[1]; wezel.w = roz[0]; wezel.h = roz[1]; }
    wezly.push(wezel);
    const dzieci = bezpiecznie(() => el.uiElements()) || [];
    for (let i = 0; i < dzieci.length; i += 1) idz(dzieci[i], glebokosc + 1, `${sciezka}.${i}`);
  }
  if (!proces.exists()) return JSON.stringify({ blad: 'brak procesu', wezly });
  const okna = proces.windows();
  for (let i = 0; i < okna.length; i += 1) idz(okna[i], 0, `o${i}`);
  return JSON.stringify({ wezly, uciete: wezly.length >= maxW });
}
