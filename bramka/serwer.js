#!/usr/bin/env node
'use strict';
// Atrapa bramki modelu dla Claude Desktop w trybie bez konta (inferenceProvider: gateway). Bez zależności, tylko
// lokalnie (127.0.0.1). Odpowiada gotowymi, zmyślonymi wiadomościami ze scenariusza; nie łączy się z żadną usługą.
// Użycie: node bramka/serwer.js [--port 8787] [--dziennik plik.jsonl]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { zdarzeniaSse, tekstSse, wiadomoscJson } = require('./sse');
const { wybierzOdpowiedz, tekstTresci } = require('./scenariusz');

const ODSTEP_ZDARZEN_MS = 15;

function blad(res, status, typ, komunikat) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ type: 'error', error: { type: typ, message: komunikat } }));
}

/** Ścieżka bez zapytania i z jednym przedrostkiem /v1 (adres bazowy może już kończyć się na /v1). */
const normalizuj = (url) => `/${url.split('?')[0].replace(/^\/+/, '').replace(/^(v1\/)+/, 'v1/')}`.replace(/\/+$/, '');

function czytajCialo(req) {
  return new Promise((ok) => {
    let dane = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { dane += c; });
    req.on('end', () => { try { ok(dane ? JSON.parse(dane) : {}); } catch { ok(null); } });
  });
}

async function wyslijStrumien(res, zdarzenia) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
  for (const z of zdarzenia) {
    res.write(tekstSse([z]));
    await new Promise((ok) => setTimeout(ok, ODSTEP_ZDARZEN_MS));
  }
  res.end();
}

function utworzSerwer({ scenariusz, modele, loguj = () => {} }) {
  return http.createServer(async (req, res) => {
    const sciezka = normalizuj(req.url);
    const wpis = { czas: new Date().toISOString(), metoda: req.method, sciezka: req.url };
    try {
      if (req.method === 'GET' && sciezka === '/v1/models') {
        loguj(wpis);
        const data = modele.map((id) => ({ type: 'model', id, display_name: id, created_at: '2026-01-01T00:00:00Z' }));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data, has_more: false, first_id: modele[0], last_id: modele[modele.length - 1] }));
        return;
      }
      if (req.method === 'POST' && sciezka === '/v1/messages/count_tokens') {
        loguj(wpis);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ input_tokens: 100 }));
        return;
      }
      if (req.method === 'POST' && sciezka === '/v1/messages') {
        const cialo = await czytajCialo(req);
        if (!cialo) { loguj({ ...wpis, blad: 'zły JSON' }); blad(res, 400, 'invalid_request_error', 'invalid JSON'); return; }
        const odp = wybierzOdpowiedz(cialo, scenariusz);
        const wiad = cialo.messages || [];
        loguj({
          ...wpis, model: cialo.model, stream: Boolean(cialo.stream), narzedzia: (cialo.tools || []).map((t) => t.name),
          wiadomosci: wiad.length, ostatniaUzytkownika: tekstTresci(wiad.length ? wiad[wiad.length - 1].content : '').slice(0, 160),
          odpowiedz: odp.rodzaj,
        });
        const model = cialo.model || modele[0];
        if (cialo.stream) await wyslijStrumien(res, zdarzeniaSse({ model, bloki: odp.bloki }));
        else { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(wiadomoscJson({ model, bloki: odp.bloki }))); }
        return;
      }
      loguj({ ...wpis, blad: 'nieznana ścieżka' });
      blad(res, 404, 'not_found_error', `unknown path ${sciezka}`);
    } catch (e) {
      loguj({ ...wpis, blad: e.message });
      if (!res.headersSent) blad(res, 500, 'api_error', 'stub error');
      else res.end();
    }
  });
}

if (require.main === module) {
  const arg = (nazwa, domyslnie) => { const i = process.argv.indexOf(nazwa); return i > 0 ? process.argv[i + 1] : domyslnie; };
  const port = Number(arg('--port', '8787'));
  const dziennik = arg('--dziennik', null);
  const scenariusz = JSON.parse(fs.readFileSync(path.join(__dirname, 'scenariusz.json'), 'utf8'));
  const loguj = (w) => {
    const linia = `${JSON.stringify(w)}\n`;
    if (dziennik) fs.appendFileSync(dziennik, linia);
    else process.stdout.write(linia);
  };
  utworzSerwer({ scenariusz, modele: scenariusz.modele, loguj }).listen(port, '127.0.0.1', () => {
    console.log(`atrapa bramki: http://127.0.0.1:${port}`);
  });
}

module.exports = { utworzSerwer, normalizuj };
