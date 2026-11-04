#!/usr/bin/env node
'use strict';
// Zapis konfiguracji trybu bez konta do preferencji zarządzanych macOS (ścieżki z dokumentacji producenta:
// /Library/Managed Preferences/[<użytkownik>/]com.anthropic.claudefordesktop.plist) i katalog notatek ze zmyślonymi
// plikami, na którym pracuje sesja Code. Tylko na jednorazowym runnerze CI (wymaga sudo).
// Użycie: node trasa/konfiguruj.js <konfiguracja.json> <katalog notatek>
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const sudo = (args) => execFileSync('sudo', args, { stdio: 'inherit' });

function zapiszPreferencje(konf) {
  const uzytkownik = os.userInfo().username;
  for (const kat of ['/Library/Managed Preferences', `/Library/Managed Preferences/${uzytkownik}`]) {
    sudo(['mkdir', '-p', kat]);
    const domena = path.join(kat, konf.domena);
    for (const [klucz, wartosc] of Object.entries(konf.klucze)) sudo(['defaults', 'write', domena, klucz, '-string', wartosc]);
    sudo(['chmod', '644', `${domena}.plist`]);
  }
  try { execFileSync('killall', ['cfprefsd'], { stdio: 'ignore' }); } catch { /* cfprefsd mógł nie działać */ }
}

const NOTATKI = {
  'notes/2026-11-03-standup.md': '# Standup 2026-11-03\n\n- Release planning\n- Docs review\n',
  'notes/2026-11-02-standup.md': '# Standup 2026-11-02\n\n- Bug triage\n',
  'notes/README.md': '# Notes\n\nMeeting notes, one file per standup.\n',
  'study-plan/README.md': '# Study plan\n',
  'templates/standup.md': '# Standup YYYY-MM-DD\n',
};

function przygotujKatalog(baza) {
  for (const [rel, tresc] of Object.entries(NOTATKI)) {
    const plik = path.join(baza, rel);
    fs.mkdirSync(path.dirname(plik), { recursive: true });
    fs.writeFileSync(plik, tresc);
  }
  for (const repo of ['notes', 'study-plan', 'templates']) {
    const g = (...a) => execFileSync('git', ['-c', 'user.name=notes', '-c', 'user.email=notes@localhost', ...a], { cwd: path.join(baza, repo), stdio: 'ignore' });
    g('init', '-q', '-b', 'main');
    g('add', '-A');
    g('commit', '-q', '-m', 'Notes');
  }
}

if (require.main === module) {
  const konf = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  zapiszPreferencje(konf);
  przygotujKatalog(process.argv[3]);
  console.log(`Konfiguracja zapisana (${Object.keys(konf.klucze).length} kluczy), katalog notatek: ${process.argv[3]}`);
}

module.exports = { przygotujKatalog, NOTATKI };
