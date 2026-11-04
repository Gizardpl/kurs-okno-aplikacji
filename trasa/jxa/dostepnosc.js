// JXA: prosi aplikację Electron o udostępnienie drzewa dostępności treści okna (atrybut AXManualAccessibility,
// zwykłe API dostępności systemu). Użycie: osascript -l JavaScript dostepnosc.js <proces>
function run(argv) {
  const se = Application('System Events');
  const proces = se.processes.byName(argv[0]);
  const wynik = {};
  for (const atrybut of ['AXManualAccessibility', 'AXEnhancedUserInterface']) {
    try {
      proces.attributes.byName(atrybut).value = true;
      wynik[atrybut] = 'ustawiony';
    } catch (e) {
      wynik[atrybut] = `błąd: ${e.message}`;
    }
  }
  return JSON.stringify(wynik);
}
