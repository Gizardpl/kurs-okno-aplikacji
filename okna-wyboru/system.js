'use strict';
// Narzędzia systemu dla okna wyboru folderu: zdjęcie ekranu, nagranie w tle i naciśnięcia klawiszy w oknie wyboru.
// macOS: screencapture i System Events (osascript); Windows: .NET CopyFromScreen, ffmpeg gdigrab i WScript.Shell SendKeys.
// Każda komenda ma limit czasu: zawieszenie (np. czekanie na zgodę systemu) kończy się błędem kroku, nie zawiesza joba.
const { execFile, execFileSync, spawn } = require('node:child_process');
const { promisify } = require('node:util');

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

/**
 * Nagranie całego ekranu w tle aż do `zakoncz()` (najwyżej `maksS` sekund): macOS screencapture -v kończy na dowolny znak
 * na wejściu, ffmpeg na „q”. Zwraca { plik, zakoncz: () => Promise<kod> }.
 */
function nagranieWTle(plikBez, maksS) {
  const plik = `${plikBez}.${MAC ? 'mov' : 'mp4'}`;
  const args = MAC
    ? ['-x', '-v', plik]
    : ['-y', '-loglevel', 'error', '-f', 'gdigrab', '-framerate', '30', '-t', String(maksS), '-i', 'desktop', '-pix_fmt', 'yuv420p', plik];
  const p = spawn(MAC ? 'screencapture' : 'ffmpeg', args, { stdio: ['pipe', 'ignore', 'ignore'] });
  const koniec = new Promise((ok) => {
    const straz = setTimeout(() => p.kill('SIGKILL'), (maksS + 30) * 1000);
    p.on('error', () => { clearTimeout(straz); ok(-1); });
    p.on('exit', (kod) => { clearTimeout(straz); ok(kod); });
  });
  p.stdin.on('error', () => { /* proces skończył sam (-t), zapis do zamkniętej rury bez znaczenia */ });
  // macOS: gdy screencapture nie zareaguje na znak w 5 s, SIGINT (zamyka plik). Windows bez SIGINT: Node zabija tam proces
  // od razu, jak SIGKILL, a ffmpeg po „q” może potrzebować dłużej na opróżnienie bufora; czeka strażnik.
  const zakoncz = () => {
    try { p.stdin.write(MAC ? 'x' : 'q'); p.stdin.end(); } catch { /* proces już zakończony */ }
    const przerwij = MAC ? setTimeout(() => { try { p.kill('SIGINT'); } catch { /* już zakończony */ } }, 5000) : null;
    return koniec.then((kod) => { clearTimeout(przerwij); return kod; });
  };
  return { plik, zakoncz };
}

/**
 * Kroki w oknie wyboru, jak człowiek: Pulpit, nowy folder, nazwa „notes”, zatwierdzenie nazwy, wybór folderu.
 * Każdy krok to naciśnięcia klawiszy w oknie o tytule `tytul` (okno aplikacji testowej na wierzchu).
 */
function krokiWyboru(tytul) {
  if (MAC) {
    // Bez sprawdzania arkusza w drzewie dostępności: na macOS 26 i 27 okno wyboru nie jest „sheet 1 of window 1”
    // (przebieg 42037600320). Klawisze, które nie trafiły, wychodzą w werdykcie (brak folderu „notes”).
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
  // Okno wyboru na wierzch tylko w pierwszym kroku: ponowne AppActivate zabiera fokus polu zmiany nazwy nowego folderu.
  // Pulpit przez pełną ścieżkę w pasku adresu („Desktop” prowadzi do wirtualnego katalogu powłoki, nie do folderu Pulpit).
  // Przed klawiszami sprawdzenie, że na wierzchu jest okno wyboru (tytuł okna z GetForegroundWindow); inaczej błąd kroku.
  const t = tytul.replace(/'/g, "''");
  // Windows 11 ARM w trakcie kroków otwiera sam okno terminala z WSL („must be updated”, przebieg 42054326729): to okno
  // czystej maszyny, nie nasze. Gdy jest na wierzchu, zamykamy tylko proces tego okna (pid z GetWindowThreadProcessId, gdy
  // to wsl albo terminal) i wracamy do okna wyboru, ale tylko w krokach, w których ponowne AppActivate niczego nie psuje
  // (przed nowym folderem). W trakcie zmiany nazwy pole nazwy jest już stracone: wtedy osobny błąd, bez dalszych klawiszy.
  const tytulNaWierzchu = '$s.Clear() | Out-Null; $h = [W.Okno]::GetForegroundWindow(); $null = [W.Okno]::GetWindowText($h, $s, 512)';
  const naWierzchu = (naprawa) => [
    "Add-Type -Name Okno -Namespace W -MemberDefinition '[DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint p);'",
    '$s = New-Object System.Text.StringBuilder 512',
    tytulNaWierzchu,
    naprawa
      ? `if ($s.ToString() -ne '${t}') { $p = 0; $null = [W.Okno]::GetWindowThreadProcessId($h, [ref]$p); $obcy = Get-Process -Id $p -ErrorAction SilentlyContinue; if ($obcy -and @('wsl', 'wslhost', 'WindowsTerminal', 'OpenConsole') -contains $obcy.ProcessName) { $obcy | Stop-Process -Force; Start-Sleep -Milliseconds 800; $null = (New-Object -ComObject WScript.Shell).AppActivate('${t}'); Start-Sleep -Milliseconds 300; ${tytulNaWierzchu} } }`
      : `if ($s.ToString() -ne '${t}') { throw ('fokus utracony w trakcie zmiany nazwy, na wierzchu: ' + $s.ToString()) }`,
    `if ($s.ToString() -ne '${t}') { throw ('na wierzchu inne okno: ' + $s.ToString()) }`,
  ].join('; ');
  // Pole zmiany nazwy nowego folderu pojawia się z opóźnieniem: na Windows 11 ARM pierwsze litery „notes” trafiły, zanim pole
  // było gotowe (przebieg 42068949887: folder „es”). Przed pisaniem czekamy (do 10 s), aż fokus ma kontrolka klasy Edit
  // (GetGUIThreadInfo wątku okna na wierzchu).
  const czekajNaPole = [
    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; using System.Text; public static class Pole { [StructLayout(LayoutKind.Sequential)] public struct RECT { public int l, t, r, b; } [StructLayout(LayoutKind.Sequential)] public struct GTI { public int cb; public int flags; public IntPtr active, focus, capture, menu, move, caret; public RECT rc; } [DllImport(\"user32.dll\")] static extern bool GetGUIThreadInfo(uint id, ref GTI g); [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n); public static string Klasa() { GTI g = new GTI(); g.cb = Marshal.SizeOf(typeof(GTI)); if (!GetGUIThreadInfo(0, ref g) || g.focus == IntPtr.Zero) return \"\"; StringBuilder s = new StringBuilder(64); GetClassName(g.focus, s, 64); return s.ToString(); } }'",
    '$k = ""; for ($i = 0; $i -lt 50; $i++) { $k = [Pole]::Klasa(); if ($k -eq "Edit") { break }; Start-Sleep -Milliseconds 200 }',
    "if ($k -ne 'Edit') { throw ('pole nazwy niegotowe, fokus w: ' + $k) }",
    'Start-Sleep -Milliseconds 300',
  ].join('; ');
  const sk = (klawisze, { naWierzch = false, naprawa = true, pole = false } = {}) => () => execFileSync('powershell', ['-NoProfile', '-Command', [
    '$w = New-Object -ComObject WScript.Shell',
    // AppActivate bywa odrzucone przez blokadę fokusu (Windows 11, przebieg 42037600320); decyduje sprawdzenie tytułu niżej.
    naWierzch ? `$null = $w.AppActivate('${t}'); Start-Sleep -Milliseconds 300` : '',
    naWierzchu(naprawa),
    pole ? czekajNaPole : '',
    ...klawisze.map((k) => `$w.SendKeys(${k}); Start-Sleep -Milliseconds 400`),
  ].filter(Boolean).join('; ')], LIMIT);
  // Wybór jak kliknięcie przycisku „Select Folder”: klawisz zatwierdzenia w liście otwiera zaznaczony folder, a wewnątrz pole
  // „Folder: notes” wskazuje nieistniejący notes\notes. Przycisk to kontrolka okna dialogowego o identyfikatorze 1 (IDOK):
  // okno dialogowe po tytule (klasa #32770), przycisk przez GetDlgItem, a wybór to WM_COMMAND z IDOK i BN_CLICKED do okna,
  // czyli to samo, co okno dostaje po kliknięciu. Przeszukanie drzewa dostępności nie widzi tego przycisku (przebieg
  // 42068949887: na Windows 11 i Server 2025 lista przycisków bez „Select Folder”). Asynchronicznie: okno obsługuje główny
  // wątek Electrona, a execFileSync go blokował (przebieg 42043191310).
  const wybierz = () => promisify(execFile)('powershell', ['-NoProfile', '-Command', [
    "Add-Type -Name Dlg -Namespace W -MemberDefinition '[DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern System.IntPtr FindWindow(string c, string t); [DllImport(\"user32.dll\")] public static extern System.IntPtr GetDlgItem(System.IntPtr h, int id); [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n); [DllImport(\"user32.dll\")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);'",
    `$okno = [W.Dlg]::FindWindow('#32770', '${t}')`,
    "if ($okno -eq [System.IntPtr]::Zero) { throw 'brak okna wyboru' }",
    '$ok = [W.Dlg]::GetDlgItem($okno, 1)',
    "if ($ok -eq [System.IntPtr]::Zero) { throw 'brak przycisku o identyfikatorze 1' }",
    '$s = New-Object System.Text.StringBuilder 128; $null = [W.Dlg]::GetWindowText($ok, $s, 128)',
    "if ($s.ToString() -notmatch 'Select Folder') { throw ('przycisk 1 to nie Select Folder: ' + $s.ToString()) }",
    'if (-not [W.Dlg]::PostMessage($okno, 0x0111, [System.IntPtr]1, $ok)) { throw \'WM_COMMAND nie wysłany\' }',
  ].join('; ')], LIMIT);
  const tekst = (s) => `'${s.replace(/'/g, "''")}'`;
  return [
    ['pulpit', sk([tekst('%d'), "([Environment]::GetFolderPath('Desktop') -replace '[+^%~(){}]', '{$0}')", tekst('~')], { naWierzch: true })],
    ['nowy-folder', sk([tekst('^+n')])],
    ['nazwa', sk([tekst('notes')], { naprawa: false, pole: true })],
    ['utworzony', sk([tekst('~')], { naprawa: false })],
    ['wybrany', wybierz],
  ];
}

module.exports = { zrzut, nagranieWTle, krokiWyboru, MAC };
