/* Label photos for community submissions: shrinks each photo in the browser and reads its barcode
 * with ZXing (self-hosted, loaded only when the first photo is added). Nothing leaves the device
 * until the person presses Submit. */
const LabelScan = (() => {
  const ZX_SRC = "/assets/vendor/zxing-library-0.21.3.min.js";
  const MAX_EDGE = 1600;          // long edge of the photo that is sent
  const MAX_DATAURL_CHARS = 900000; // about 650 KB per photo after compression
  let zxPromise = null;

  function loadZXing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (!zxPromise) {
      zxPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = ZX_SRC; s.async = true;
        s.onload = () => (window.ZXing ? resolve(window.ZXing) : reject(new Error("ZXing missing")));
        s.onerror = () => { zxPromise = null; reject(new Error("ZXing failed to load")); };
        document.head.appendChild(s);
      });
    }
    return zxPromise;
  }

  /** GS1 check digit for 8, 12, 13 and 14 digit codes (EAN-8, UPC-A, EAN-13, GTIN-14). */
  function gs1Ok(code) {
    if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
    const d = code.split("").map(Number), check = d.pop();
    let sum = 0;
    for (let i = d.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += d[i] * w;
    return (10 - (sum % 10)) % 10 === check;
  }

  function rotate90(lum, w, h) {
    const out = new Uint8ClampedArray(lum.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x * h + (h - 1 - y)] = lum[y * w + x];
    return { lum: out, w: h, h: w };
  }

  /** Try to read a barcode from grey pixels, upright and turned by 90, 180 and 270 degrees. */
  function decodeLuminance(ZX, lum, w, h) {
    const hints = new Map();
    hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E]);
    hints.set(ZX.DecodeHintType.TRY_HARDER, true);
    let cur = { lum, w, h };
    for (let turn = 0; turn < 4; turn++) {
      try {
        const reader = new ZX.MultiFormatReader();
        reader.setHints(hints);
        const bmp = new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.RGBLuminanceSource(cur.lum, cur.w, cur.h)));
        const text = reader.decode(bmp).getText();
        if (gs1Ok(text)) return text;
      } catch (_) { /* not found at this angle */ }
      cur = rotate90(cur.lum, cur.w, cur.h);
    }
    return null;
  }

  function grey(canvas) {
    const { width: w, height: h } = canvas;
    const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
    const lum = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) lum[j] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    return { lum, w, h };
  }

  function scaled(source, sw, sh, maxEdge) {
    const k = Math.min(1, maxEdge / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
    c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
    return c;
  }

  async function bitmapOf(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (_) { /* fall back */ }
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not open that image")); };
      im.src = url;
    });
  }

  /** Shrink one photo. Returns { dataUrl, barcode } where barcode is a valid code or null. */
  async function prepare(file) {
    const bmp = await bitmapOf(file);
    const sw = bmp.width || bmp.naturalWidth, sh = bmp.height || bmp.naturalHeight;
    const main = scaled(bmp, sw, sh, MAX_EDGE);
    if (bmp.close) bmp.close();
    let dataUrl = main.toDataURL("image/jpeg", 0.8);
    for (const q of [0.68, 0.55]) { if (dataUrl.length <= MAX_DATAURL_CHARS) break; dataUrl = main.toDataURL("image/jpeg", q); }
    if (dataUrl.length > MAX_DATAURL_CHARS) throw new Error("That photo is too detailed to send. Try a smaller one.");
    let barcode = null;
    try {
      const ZX = await loadZXing();
      for (const edge of [MAX_EDGE, 1000]) {
        const c = edge >= Math.max(main.width, main.height) ? main : scaled(main, main.width, main.height, edge);
        const g = grey(c);
        barcode = decodeLuminance(ZX, g.lum, g.w, g.h);
        if (barcode) break;
      }
    } catch (_) { /* barcode reading is optional: the person can type it */ }
    return { dataUrl, barcode };
  }

  return { prepare, gs1Ok, loadZXing, _decodeLuminance: decodeLuminance };
})();
if (typeof module !== "undefined") module.exports = LabelScan;
