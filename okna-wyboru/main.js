'use strict';
// Systemowe okno wyboru folderu otwarte tak samo jak w aplikacji desktopowej („Open folder…”): showOpenDialog z
// openDirectory i createDirectory, przyczepione do okna, z tym samym tytułem. Po chwili zdjęcie całego ekranu narzędziem
// systemu, krótkie nagranie ekranu (próba, czy runner nagrywa bez człowieka) i koniec. Bez sieci, danych i klikania w okno.
const { app, BrowserWindow, dialog, nativeTheme } = require('electron');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const WYJSCIE = process.env.OKNA_WYJSCIE || path.join(process.cwd(), 'zrzuty');
const CZEKAJ_MS = 4000;
const TYTUL = 'Select folder for local session';

/** Zdjęcie całego ekranu: macOS screencapture, Windows .NET CopyFromScreen. */
function zrzut(plik) {
  if (process.platform === 'darwin') {
    execFileSync('screencapture', ['-x', '-t', 'png', plik]);
    return;
  }
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
    '$e = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    '$b = New-Object System.Drawing.Bitmap $e.Width, $e.Height',
    '[System.Drawing.Graphics]::FromImage($b).CopyFromScreen($e.Location, [System.Drawing.Point]::Empty, $e.Size)',
    `$b.Save('${plik.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)`,
  ].join('; ');
  execFileSync('powershell', ['-NoProfile', '-Command', ps]);
}

/** Nagranie całego ekranu przez NAGRANIE_S sekund: macOS screencapture -V, Windows ffmpeg gdigrab (jest na runnerze). */
const NAGRANIE_S = 5;
function nagranie(plikBez) {
  if (process.platform === 'darwin') {
    execFileSync('screencapture', ['-x', `-V${NAGRANIE_S}`, `${plikBez}.mov`]);
    return;
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', '15', '-t', String(NAGRANIE_S), '-i', 'desktop', `${plikBez}.mp4`]);
}

/** Każdy krok osobno: błąd jednego (np. brak zgody systemu na nagrywanie) trafia do wyniku i nie gubi drugiego. */
function krok(nazwa, f, wynik) {
  try { f(); wynik[nazwa] = 'ok'; } catch (e) { wynik[nazwa] = `błąd: ${String(e.message).slice(0, 300)}`; }
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  require('node:fs').mkdirSync(WYJSCIE, { recursive: true });
  const okno = new BrowserWindow({ width: 1200, height: 800, backgroundColor: '#181818', show: true });
  okno.loadURL('data:text/html,<body style="background:%23181818"></body>');
  okno.once('ready-to-show', () => okno.focus());
  setTimeout(() => {
    dialog.showOpenDialog(okno, { title: TYTUL, message: TYTUL, properties: ['openDirectory', 'createDirectory'] });
    setTimeout(() => {
      const wynik = {};
      krok('zrzut', () => zrzut(path.join(WYJSCIE, `okno-wyboru-${process.platform}.png`)), wynik);
      krok('nagranie', () => nagranie(path.join(WYJSCIE, `okno-wyboru-${process.platform}`)), wynik);
      require('node:fs').writeFileSync(path.join(WYJSCIE, `wynik-${process.platform}.json`), JSON.stringify(wynik, null, 2));
      console.log(JSON.stringify(wynik));
      app.exit(Object.values(wynik).every((w) => w === 'ok') ? 0 : 1);
    }, CZEKAJ_MS);
  }, 1500);
});
