// JXA: wpisanie tekstu albo naciśnięcie klawisza z modyfikatorami (System Events), do procesu na wierzchu.
// Użycie: osascript -l JavaScript klawisze.js '<json>'   json: {"tekst":"..."} albo {"kod":36,"z":["command"]}
function run(argv) {
  const se = Application('System Events');
  const k = JSON.parse(argv[0]);
  const using = (k.z || []).map((m) => `${m} down`);
  if (typeof k.tekst === 'string') {
    for (const znak of k.tekst) { se.keystroke(znak); delay(0.02); }
  } else {
    se.keyCode(k.kod, using.length ? { using } : {});
  }
  return 'ok';
}
