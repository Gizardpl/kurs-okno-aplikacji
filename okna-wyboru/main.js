'use strict';
// Systemowe okno wyboru folderu otwarte tak samo jak w aplikacji desktopowej („Open folder…”): showOpenDialog z
// openDirectory i createDirectory, przyczepione do okna, z tym samym tytułem. W oknie kroki jak u człowieka (Pulpit, nowy
// folder „notes”, wybór), po każdym zdjęcie ekranu, całość nagrana. Bez sieci i bez danych; wynik każdego kroku w
// wynik-<system>.json (tylko „ok” albo treść błędu), wersja systemu w system-<system>.json.
const { app, BrowserWindow, dialog, nativeTheme } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { zrzut, nagranieWTle, krokiWyboru } = require('./system');

const WYJSCIE = process.env.OKNA_WYJSCIE || path.join(process.cwd(), 'zrzuty');
const TYTUL = 'Select folder for local session';
const PO_KROKU_MS = 1500;
const NAGRANIE_S = 20;
const czekaj = (ms) => new Promise((ok) => setTimeout(ok, ms));
const blad = (e) => `błąd: ${String(e && e.message).slice(0, 300)}`;

/** Krok do wyniku: „ok” albo treść błędu; błąd jednego kroku nie przerywa następnych. */
function krok(wynik, nazwa, f) {
  try { f(); wynik[nazwa] = 'ok'; } catch (e) { wynik[nazwa] = blad(e); }
}

function stan(wynik, nr, nazwa) {
  const plik = path.join(WYJSCIE, `${process.platform}-${String(nr).padStart(2, '0')}-${nazwa}.png`);
  krok(wynik, `zrzut ${nazwa}`, () => { zrzut(plik); if (!fs.statSync(plik).size) throw new Error('pusty plik'); });
}

async function przebieg() {
  nativeTheme.themeSource = 'dark';
  fs.mkdirSync(WYJSCIE, { recursive: true });
  fs.writeFileSync(path.join(WYJSCIE, `system-${process.platform}.json`),
    JSON.stringify({ platforma: process.platform, wydanie: os.release(), wersja: os.version(), electron: process.versions.electron }, null, 2));
  const wynik = {};
  const okno = new BrowserWindow({ width: 1200, height: 800, backgroundColor: '#181818', show: true });
  await okno.loadURL('data:text/html,<body style="background:%23181818"></body>');
  okno.focus();
  const nagranie = nagranieWTle(path.join(WYJSCIE, `${process.platform}-nagranie`), NAGRANIE_S);
  await czekaj(1500);
  const wybor = dialog.showOpenDialog(okno, { title: TYTUL, message: TYTUL, properties: ['openDirectory', 'createDirectory'] })
    .then((r) => { wynik['wybrany folder'] = r.canceled ? 'anulowano' : r.filePaths.map((p) => path.basename(p)).join(', '); })
    .catch((e) => { wynik.okno = blad(e); });
  await czekaj(2500);
  stan(wynik, 0, 'start');
  let nr = 1;
  for (const [nazwa, f] of krokiWyboru(TYTUL)) {
    krok(wynik, nazwa, f);
    await czekaj(PO_KROKU_MS);
    stan(wynik, nr++, nazwa);
  }
  await Promise.race([wybor, czekaj(3000)]);
  const kod = await nagranie.koniec;
  wynik.nagranie = kod === 0 && fs.existsSync(nagranie.plik) && fs.statSync(nagranie.plik).size ? 'ok' : `błąd: kod ${kod}`;
  fs.writeFileSync(path.join(WYJSCIE, `wynik-${process.platform}.json`), JSON.stringify(wynik, null, 2));
  console.log(JSON.stringify(wynik));
  return Object.entries(wynik).every(([k, w]) => w === 'ok' || k === 'wybrany folder') ? 0 : 1;
}

app.whenReady().then(przebieg).then((kod) => app.exit(kod), (e) => { console.error(blad(e)); app.exit(1); });
