// JXA: wybór pozycji z paska menu aplikacji (np. ["Help", "Troubleshooting", "…"]).
// Użycie: osascript -l JavaScript menu.js <proces> '<json tablica nazw>'
function run(argv) {
  const se = Application('System Events');
  const proces = se.processes.byName(argv[0]);
  const sciezka = JSON.parse(argv[1]);
  proces.frontmost = true;
  let menu = proces.menuBars[0].menuBarItems.byName(sciezka[0]);
  menu.click();
  delay(0.3);
  let element = menu;
  for (let i = 1; i < sciezka.length; i += 1) {
    element = element.menus[0].menuItems.byName(sciezka[i]);
    element.click();
    delay(0.3);
  }
  return 'ok';
}
