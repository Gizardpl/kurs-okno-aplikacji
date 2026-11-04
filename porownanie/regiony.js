'use strict';
// Prostokąty obejmujące skupiska zmienionych pikseli. Piksele odległe o najwyżej `odstep` łączą się w jedno skupisko
// (tekst, ikona), żeby raport wskazywał elementy okna, a nie pojedyncze piksele.

/**
 * @param {Uint8Array} maska 1 = piksel zmieniony, długość w*h
 * @returns {{x:number,y:number,w:number,h:number,piksele:number}[]} posortowane od góry do dołu, od lewej
 */
function prostokaty(maska, w, h, { odstep = 6 } = {}) {
  const k = Math.max(1, odstep);
  const kw = Math.ceil(w / k);
  const kh = Math.ceil(h / k);
  const komorki = new Int32Array(kw * kh); // liczba zmienionych pikseli w komórce siatki
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) if (maska[y * w + x]) komorki[Math.floor(y / k) * kw + Math.floor(x / k)] += 1;
  }
  const odwiedzone = new Uint8Array(kw * kh);
  const wynik = [];
  for (let start = 0; start < komorki.length; start += 1) {
    if (!komorki[start] || odwiedzone[start]) continue;
    const stos = [start];
    odwiedzone[start] = 1;
    const grupa = [];
    while (stos.length) {
      const c = stos.pop();
      grupa.push(c);
      const cx = c % kw; const cy = (c - cx) / kw;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = cx + dx; const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= kw || ny >= kh) continue;
          const n = ny * kw + nx;
          if (komorki[n] && !odwiedzone[n]) { odwiedzone[n] = 1; stos.push(n); }
        }
      }
    }
    wynik.push(dokladnyProstokat(maska, w, h, k, kw, grupa));
  }
  return wynik.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Dokładne granice pikseli w komórkach skupiska. */
function dokladnyProstokat(maska, w, h, k, kw, grupa) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1; let piksele = 0;
  for (const c of grupa) {
    const cx = c % kw; const cy = (c - cx) / kw;
    for (let y = cy * k; y < Math.min(h, (cy + 1) * k); y += 1) {
      for (let x = cx * k; x < Math.min(w, (cx + 1) * k); x += 1) {
        if (!maska[y * w + x]) continue;
        piksele += 1;
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
    }
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, piksele };
}

module.exports = { prostokaty };
