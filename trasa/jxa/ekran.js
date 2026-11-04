// JXA: rozmiar głównego ekranu, obszar widoczny (bez paska menu i Docka) i skala pikseli.
// Użycie: osascript -l JavaScript ekran.js
ObjC.import('AppKit');
function run() {
  const s = $.NSScreen.mainScreen;
  const f = s.frame;
  const v = s.visibleFrame;
  const wysokosc = f.size.height;
  return JSON.stringify({
    w: f.size.width,
    h: wysokosc,
    skala: s.backingScaleFactor,
    widoczny: { x: v.origin.x, y: wysokosc - v.origin.y - v.size.height, w: v.size.width, h: v.size.height },
  });
}
