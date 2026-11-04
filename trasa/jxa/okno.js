// JXA: położenie i rozmiar pierwszego okna procesu; z liczbami ustawia je (punkty ekranu, lewy górny róg).
// Użycie: osascript -l JavaScript okno.js <proces> [x y w h]
function run(argv) {
  const se = Application('System Events');
  const proces = se.processes.byName(argv[0]);
  if (!proces.exists()) return JSON.stringify({ blad: 'brak procesu' });
  proces.frontmost = true;
  const okna = proces.windows();
  if (!okna.length) return JSON.stringify({ blad: 'brak okna' });
  const okno = okna[0];
  if (argv.length >= 5) {
    okno.position = [Number(argv[1]), Number(argv[2])];
    okno.size = [Number(argv[3]), Number(argv[4])];
    delay(0.5);
  }
  const [x, y] = okno.position();
  const [w, h] = okno.size();
  let nazwa = '';
  try { nazwa = okno.name(); } catch (e) { nazwa = ''; }
  return JSON.stringify({ x, y, w, h, nazwa, okien: okna.length });
}
