// JXA: ruch i klik myszy zdarzeniami systemu (CoreGraphics), w globalnych punktach ekranu.
// Użycie: osascript -l JavaScript mysz.js <ruch|klik> <x> <y>
ObjC.import('CoreGraphics');
function run(argv) {
  const p = $.CGPointMake(Number(argv[1]), Number(argv[2]));
  const wyslij = (typ) => {
    const e = $.CGEventCreateMouseEvent($(), typ, p, $.kCGMouseButtonLeft);
    $.CGEventPost($.kCGHIDEventTap, e);
  };
  wyslij($.kCGEventMouseMoved);
  if (argv[0] === 'klik') {
    delay(0.15);
    wyslij($.kCGEventLeftMouseDown);
    delay(0.06);
    wyslij($.kCGEventLeftMouseUp);
  }
  return 'ok';
}
