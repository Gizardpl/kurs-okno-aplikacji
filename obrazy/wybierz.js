'use strict';
// Wybór najświeższych obrazów systemu GitHub Actions, żeby okna systemu wyglądały jak w najnowszej wersji: z tabeli obrazów
// w README actions/runner-images i z opisu każdego obrazu (wiersz „OS Version”) bierze najwyższą wersję macOS (Apple
// silicon, także beta i preview) i Windows oraz poprzednią jako zapas. Uruchomiony bez argumentów pisze wynik do
// $GITHUB_OUTPUT; bez sieci, przy zmianie formatu albo etykiecie spoza wzorca zwraca bezpieczny zapas.
const README = 'https://raw.githubusercontent.com/actions/runner-images/main/README.md';
const ZAPAS = { mac: 'macos-latest', macZapas: 'macos-15', macWersja: '?', win: 'windows-latest', winZapas: 'windows-2022', winWersja: '?' };

/** Wiersze tabeli obrazów: { nazwa, arch, etykiety, opis } (opis = adres surowego pliku z wersją systemu). */
function obrazyZTabeli(readme) {
  const odnosniki = Object.fromEntries([...readme.matchAll(/^\[([^\]]+)\]: (https:\/\/github\.com\/\S+)$/gm)].map((m) => [m[1], m[2]]));
  const wiersze = [];
  for (const m of readme.matchAll(/^\| ([^|<[]+?)\s*(?:\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\))?<br>[^|]*\| (arm64|x64) \| ([^|]+) \| \[([^\]]+)\] \|$/gm)) {
    const etykiety = [...m[3].matchAll(/`([^`]+)`/g)].map((e) => e[1]);
    const adres = odnosniki[m[4]];
    if (!adres) continue;
    wiersze.push({ nazwa: m[1].trim(), arch: m[2], etykiety, opis: adres.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/') });
  }
  return wiersze;
}

/** Wersja systemu z opisu obrazu: „OS Version: macOS 27.0.1 (…)” → [27, 0, 1]; Windows: numer kompilacji. */
function wersjaZOpisu(tekst) {
  const m = /OS Version:\s*(?:macOS\s*)?([\d.]+)/i.exec(tekst || '');
  return m ? m[1].split('.').map(Number) : null;
}

const porownaj = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) if ((a[i] || 0) !== (b[i] || 0)) return (b[i] || 0) - (a[i] || 0);
  return 0;
};
/** Etykieta standardowego (darmowego) runnera z wiersza: bez „large”, „xlarge” i „latest”. */
const etykieta = (w) => w.etykiety.find((e) => !/large|latest/.test(e));

/**
 * Wybór z wierszy z wersjami ({ ...wiersz, wersja }): macOS arm64 według wersji; Windows według kompilacji, przy remisie
 * system desktopowy (Windows 11) przed serwerowym. Zwraca etykiety najnowszego i poprzedniego obrazu oraz wersje.
 */
function wybierz(wiersze) {
  const mac = wiersze.filter((w) => /^(macOS|Xcode)\b/.test(w.nazwa) && w.arch === 'arm64' && w.wersja && etykieta(w))
    .sort((a, b) => porownaj(a.wersja, b.wersja));
  const win = wiersze.filter((w) => /^Windows\b/.test(w.nazwa) && w.wersja && etykieta(w))
    .sort((a, b) => porownaj(a.wersja, b.wersja) || (/Server/.test(a.nazwa) ? 1 : 0) - (/Server/.test(b.nazwa) ? 1 : 0));
  if (!mac.length || !win.length) return { ...ZAPAS };
  const drugi = (lista) => lista.find((w) => etykieta(w) !== etykieta(lista[0]));
  /** Zapas zawsze inny niż główny obraz (ta sama etykieta = ten sam błąd i konflikt nazwy artefaktu). */
  const zapas = (lista, staly, inny) => (drugi(lista) ? etykieta(drugi(lista)) : etykieta(lista[0]) !== staly ? staly : inny);
  const wynik = {
    mac: etykieta(mac[0]), macZapas: zapas(mac, ZAPAS.macZapas, ZAPAS.mac), macWersja: mac[0].wersja.join('.'),
    win: etykieta(win[0]), winZapas: zapas(win, ZAPAS.winZapas, ZAPAS.win), winWersja: win[0].wersja.join('.'),
  };
  return poprawny(wynik) ? wynik : { ...ZAPAS };
}

/**
 * Tekst z internetu trafia do `runs-on` i $GITHUB_OUTPUT, więc tylko etykiety hostowanych obrazów GitHuba w jednej linii
 * (np. macos-26, xcode-27, windows-11-arm) i wersje z cyfr i kropek; cokolwiek innego = zapas.
 */
const ETYKIETA = /^(macos|xcode|windows)-[a-z0-9-]{1,30}$/;
const WERSJA = /^\d+(\.\d+){0,3}$/;
const poprawny = (w) => [w.mac, w.macZapas, w.win, w.winZapas].every((e) => ETYKIETA.test(e)) && WERSJA.test(w.macWersja) && WERSJA.test(w.winWersja);

/** Cały wybór z sieci (`pobierz(adres) → Promise<tekst>`); każdy błąd = bezpieczny zapas. */
async function wybierzZSieci(pobierz) {
  try {
    const wiersze = obrazyZTabeli(await pobierz(README));
    // Brak opisu któregokolwiek obrazu = brak pełnej listy: zapas zamiast wyboru z niepełnej (mógłby wskazać starszy obraz).
    for (const w of wiersze) {
      if (!/^(macOS|Xcode|Windows)\b/.test(w.nazwa)) continue;
      w.wersja = wersjaZOpisu(await pobierz(w.opis));
      if (!w.wersja) throw new Error(`brak wersji systemu w opisie ${w.nazwa}`);
    }
    return wybierz(wiersze);
  } catch {
    return { ...ZAPAS };
  }
}

const pobierzTekst = async (adres) => {
  const r = await fetch(adres, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
};

if (require.main === module) {
  wybierzZSieci(pobierzTekst).then((w) => {
    const linie = [`mac=${w.mac}`, `mac_zapas=${w.macZapas}`, `mac_wersja=${w.macWersja}`, `win=${w.win}`, `win_zapas=${w.winZapas}`, `win_wersja=${w.winWersja}`];
    console.log(linie.join('\n'));
    if (process.env.GITHUB_OUTPUT) require('node:fs').appendFileSync(process.env.GITHUB_OUTPUT, `${linie.join('\n')}\n`);
  });
}

module.exports = { obrazyZTabeli, wersjaZOpisu, wybierz, wybierzZSieci, pobierzTekst, README, ZAPAS };
