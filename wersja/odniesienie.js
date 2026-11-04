#!/usr/bin/env node
'use strict';
// Punkt odniesienia: najnowszy niewygasły artefakt „zrzuty” z innego przebiegu tego repo (GitHub REST API,
// GITHUB_TOKEN z uprawnieniem actions: read). Decyzja, czy uruchomić pełny przebieg na macOS.
// Użycie: node wersja/odniesienie.js <wersja najnowsza> <katalog na pobrany punkt odniesienia>
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const NAZWA = 'zrzuty';
const ODSWIEZ_PO_DNIACH = 14; // artefakt „zrzuty” żyje 30 dni (2 × 14 + zapas): starszy wzorzec odświeżamy, zanim wygaśnie

/** Najnowszy niewygasły artefakt o nazwie `nazwa` z przebiegu innego niż bieżący. */
function wybierzArtefakt(artefakty, biezacyPrzebieg, nazwa = NAZWA) {
  return artefakty
    .filter((a) => a.name === nazwa && !a.expired && String(a.workflow_run && a.workflow_run.id) !== String(biezacyPrzebieg))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
}

/** Czy uruchomić pełny przebieg i dlaczego. */
function decyzja({ zdarzenie, wersja, odniesienie, teraz = new Date() }) {
  if (zdarzenie === 'workflow_dispatch') return { pelny: true, powod: 'uruchomienie ręczne' };
  if (!odniesienie) return { pelny: true, powod: 'brak punktu odniesienia' };
  if (odniesienie.wersja !== wersja) return { pelny: true, powod: `nowa wersja ${wersja} (poprzednio ${odniesienie.wersja})` };
  const dni = (teraz - Date.parse(odniesienie.utworzony)) / 86400000;
  if (dni > ODSWIEZ_PO_DNIACH) return { pelny: true, powod: `punkt odniesienia ma ${Math.floor(dni)} dni` };
  return { pelny: false, powod: `bez zmian: wersja ${wersja}` };
}

async function api(sciezka, opcje = {}) {
  const odp = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${sciezka}`, {
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    ...opcje,
  });
  if (!odp.ok) throw new Error(`GitHub API ${sciezka}: HTTP ${odp.status}`);
  return odp;
}

async function pobierzOdniesienie(katalog) {
  const repo = process.env.GITHUB_REPOSITORY;
  const lista = await (await api(`/repos/${repo}/actions/artifacts?name=${NAZWA}&per_page=50`)).json();
  const artefakt = wybierzArtefakt(lista.artifacts || [], process.env.GITHUB_RUN_ID);
  if (!artefakt) return null;
  const zip = Buffer.from(await (await api(`/repos/${repo}/actions/artifacts/${artefakt.id}/zip`)).arrayBuffer());
  fs.mkdirSync(katalog, { recursive: true });
  const plikZip = path.join(katalog, '..', 'odniesienie.zip');
  fs.writeFileSync(plikZip, zip);
  execFileSync('unzip', ['-q', '-o', plikZip, '-d', katalog]);
  fs.rmSync(plikZip);
  const meta = JSON.parse(fs.readFileSync(path.join(katalog, 'meta.json'), 'utf8'));
  return { wersja: meta.wersja, utworzony: artefakt.created_at, przebieg: artefakt.workflow_run.id, artefakt: artefakt.id };
}

if (require.main === module) {
  const [wersja, katalog] = process.argv.slice(2);
  pobierzOdniesienie(katalog).then((odniesienie) => {
    const d = decyzja({ zdarzenie: process.env.GITHUB_EVENT_NAME, wersja, odniesienie });
    console.log(JSON.stringify({ ...d, odniesienie }));
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `pelny=${d.pelny}\npowod=${d.powod}\nodniesienie=${odniesienie ? odniesienie.przebieg : ''}\n`);
    }
  }).catch((e) => { console.error(`::error::${e.message}`); process.exitCode = 1; });
}

module.exports = { wybierzArtefakt, decyzja, ODSWIEZ_PO_DNIACH };
