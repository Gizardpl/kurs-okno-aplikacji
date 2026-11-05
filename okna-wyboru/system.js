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
  const naWierzchu = [
    "Add-Type -Name Okno -Namespace W -MemberDefinition '[DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);'",
    '$s = New-Object System.Text.StringBuilder 512; $null = [W.Okno]::GetWindowText([W.Okno]::GetForegroundWindow(), $s, 512)',
    `if ($s.ToString() -ne '${t}') { throw ('na wierzchu inne okno: ' + $s.ToString()) }`,
  ].join('; ');
  const sk = (klawisze, naWierzch = false) => () => execFileSync('powershell', ['-NoProfile', '-Command', [
    '$w = New-Object -ComObject WScript.Shell',
    // AppActivate bywa odrzucone przez blokadę fokusu (Windows 11, przebieg 42037600320); decyduje sprawdzenie tytułu niżej.
    naWierzch ? `$null = $w.AppActivate('${t}'); Start-Sleep -Milliseconds 300` : '',
    naWierzchu,
    ...klawisze.map((k) => `$w.SendKeys(${k}); Start-Sleep -Milliseconds 400`),
  ].filter(Boolean).join('; ')], LIMIT);
  // Wybór jak kliknięcie przycisku „Select Folder” (przycisk OK okna, identyfikator 1) przez UI Automation: klawisz
  // zatwierdzenia w liście otwiera zaznaczony folder, a wewnątrz pole „Folder: notes” wskazuje nieistniejący notes\notes.
  // Asynchronicznie: zapytania o przycisk obsługuje główny wątek Electrona, a execFileSync go blokował (przebieg 42043191310:
  // przekroczony limit na obu obrazach Windows).
  const wybierz = () => promisify(execFile)('powershell', ['-NoProfile', '-Command', [
    'Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes',
    '$A = [System.Windows.Automation.AutomationElement]',
    // Okno wyboru wśród okien najwyższego poziomu albo okien przez nie posiadanych (dwa poziomy Children): przeszukanie
    // całego pulpitu (Descendants) trwało ponad 30 s (przebieg 42041631432).
    '$S = [System.Windows.Automation.TreeScope]::Children',
    `$jak = New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, '${t}')`,
    '$okno = $A::RootElement.FindFirst($S, $jak)',
    'if (-not $okno) { foreach ($g in $A::RootElement.FindAll($S, [System.Windows.Automation.Condition]::TrueCondition)) { $okno = $g.FindFirst($S, $jak); if ($okno) { break } } }',
    "if (-not $okno) { throw 'brak okna wyboru' }",
    "$ok = $okno.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.AndCondition((New-Object System.Windows.Automation.PropertyCondition($A::AutomationIdProperty, '1')), (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)))))",
    "if (-not $ok) { throw 'brak przycisku Select Folder' }",
    '$ok.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()',
  ].join('; ')], LIMIT);
  const tekst = (s) => `'${s.replace(/'/g, "''")}'`;
  return [
    ['pulpit', sk([tekst('%d'), "([Environment]::GetFolderPath('Desktop') -replace '[+^%~(){}]', '{$0}')", tekst('~')], true)],
    ['nowy-folder', sk([tekst('^+n')])],
    ['nazwa', sk([tekst('notes')])],
    ['utworzony', sk([tekst('~')])],
    ['wybrany', wybierz],
  ];
}

module.exports = { zrzut, nagranieWTle, krokiWyboru, MAC };
