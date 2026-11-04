'use strict';
// Odpowiedź w formacie Messages API: strumień zdarzeń SSE albo pełna wiadomość JSON.
// Bloki odpowiedzi: { type: 'text', text } albo { type: 'tool_use', id, name, input }.

const DLUGOSC_KAWALKA = 8;

let licznik = 0;
const noweId = (przedrostek) => `${przedrostek}_atrapa${String(++licznik).padStart(6, '0')}`;

function uzycie(wyjscie) {
  return {
    input_tokens: 100,
    output_tokens: wyjscie,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
  };
}

const powodKonca = (bloki) => (bloki.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn');

/** Tekst podzielony na kawałki (słowa ze spacją), jak w prawdziwym strumieniu. */
function kawalki(tekst) {
  const wynik = tekst.match(/\S+\s*/g) || [''];
  return wynik.length > 1 || tekst.length <= DLUGOSC_KAWALKA ? wynik : tekst.match(new RegExp(`.{1,${DLUGOSC_KAWALKA}}`, 'gs'));
}

/** Lista zdarzeń { event, data } dla strumienia odpowiedzi. */
function zdarzeniaSse({ model, bloki }) {
  const z = [];
  const dodaj = (data) => z.push({ event: data.type, data });
  dodaj({
    type: 'message_start',
    message: { id: noweId('msg'), type: 'message', role: 'assistant', content: [], model, stop_reason: null, stop_sequence: null, usage: uzycie(1) },
  });
  bloki.forEach((blok, index) => {
    if (blok.type === 'text') {
      dodaj({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      for (const k of kawalki(blok.text)) dodaj({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: k } });
    } else {
      dodaj({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: blok.id, name: blok.name, input: {} } });
      const json = JSON.stringify(blok.input);
      for (let i = 0; i < json.length; i += DLUGOSC_KAWALKA * 4) {
        dodaj({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + DLUGOSC_KAWALKA * 4) } });
      }
    }
    dodaj({ type: 'content_block_stop', index });
  });
  dodaj({ type: 'message_delta', delta: { stop_reason: powodKonca(bloki), stop_sequence: null }, usage: { output_tokens: 20 } });
  dodaj({ type: 'message_stop' });
  return z;
}

const tekstSse = (zdarzenia) => zdarzenia.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');

function wiadomoscJson({ model, bloki }) {
  return {
    id: noweId('msg'), type: 'message', role: 'assistant', model,
    content: bloki.map((b) => (b.type === 'text' ? { type: 'text', text: b.text } : { type: 'tool_use', id: b.id, name: b.name, input: b.input })),
    stop_reason: powodKonca(bloki), stop_sequence: null, usage: uzycie(20),
  };
}

module.exports = { zdarzeniaSse, tekstSse, wiadomoscJson, noweId };
