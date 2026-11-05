'use strict';
// Narzędzia systemu dla okna wyboru folderu: zdjęcie ekranu, nagranie w tle i naciśnięcia klawiszy w oknie wyboru.
// macOS: screencapture i System Events (osascript); Windows: .NET CopyFromScreen, ffmpeg gdigrab i WScript.Shell SendKeys.
// Każda komenda ma limit czasu: zawieszenie (np. czekanie na zgodę systemu) kończy się błędem kroku, nie zawiesza joba.
const { execFileSync, spawn } = require('node:child_process');

const LIMIT = { timeout: 30000, killSignal: 'SIGKILL' };
const MAC = process.platform === 'darwin';

function zrzut(plik) {
  if (MAC) {
    execFileSync('screencapture', ['-x', '-t', 'png', plik], LIMIT);
    return plik;
  }
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
    '$e = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    '$b = New-Object System.Drawing.Bitmap $e.Width, $e.Height',
    '[System.Drawing.Graphics]::FromImage($b).CopyFromScreen($e.Location, [System.Drawing.Point]::Empty, $e.Size)',
    `$b.Save('${plik.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)`,
  ].join('; ');
  execFileSync('powershell', ['-NoProfile', '-Command', ps], LIMIT);
  return plik;
}

/** Nagranie całego ekranu w tle przez `sekundy`; zwraca { plik, koniec: Promise<kod> }. */
function nagranieWTle(plikBez, sekundy) {
  const plik = `${plikBez}.${MAC ? 'mov' : 'mp4'}`;
  const args = MAC
    ? ['-x', `-V${sekundy}`, plik]
    : ['-y', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', '30', '-t', String(sekundy), '-i', 'desktop', '-pix_fmt', 'yuv420p', plik];
  const p = spawn(MAC ? 'screencapture' : 'ffmpeg', args, { stdio: 'ignore' });
  const koniec = new Promise((ok) => {
    const straz = setTimeout(() => p.kill('SIGKILL'), (sekundy + 30) * 1000);
    p.on('error', () => { clearTimeout(straz); ok(-1); });
    p.on('exit', (kod) => { clearTimeout(straz); ok(kod); });
  });
  return { plik, koniec };
}

/**
 * Kroki w oknie wyboru, jak człowiek: Pulpit, nowy folder, nazwa „notes”, zatwierdzenie nazwy, wybór folderu.
 * Każdy krok to naciśnięcia klawiszy w oknie o tytule `tytul` (okno aplikacji testowej na wierzchu).
 */
function krokiWyboru(tytul) {
  if (MAC) {
    const se = (polecenie) => () => execFileSync('osascript', ['-e', 'tell application "System Events"',
      '-e', 'set frontmost of process "Electron" to true', '-e', polecenie, '-e', 'end tell'], LIMIT);
    return [
      ['pulpit', se('keystroke "d" using {command down, shift down}')],
      ['nowy-folder', se('keystroke "n" using {command down, shift down}')],
      ['nazwa', se('keystroke "a" using {command down}\nkeystroke "notes"')],
      ['utworzony', se('key code 36')],
      ['wybrany', se('key code 36')],
    ];
  }
  const sk = (klawisze) => () => execFileSync('powershell', ['-NoProfile', '-Command',
    `$w = New-Object -ComObject WScript.Shell; $null = $w.AppActivate('${tytul.replace(/'/g, "''")}'); Start-Sleep -Milliseconds 300; ${klawisze.map((k) => `$w.SendKeys('${k}'); Start-Sleep -Milliseconds 400`).join('; ')}`], LIMIT);
  return [
    ['pulpit', sk(['%d', 'Desktop', '~'])],
    ['nowy-folder', sk(['^+n'])],
    ['nazwa', sk(['notes'])],
    ['utworzony', sk(['~'])],
    ['wybrany', sk(['~'])],
  ];
}

module.exports = { zrzut, nagranieWTle, krokiWyboru, MAC };
