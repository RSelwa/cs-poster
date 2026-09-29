// Aléa déterministe : même graine → même suite de nombres, donc même poster.

export function mulberry32(a: number) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Bruit de valeur 2D lissé, sur une table de 256 × 256
export function makeNoise(seed: number) {
  const rnd = mulberry32(seed), G = 256, tab = new Float32Array(G * G);
  for (let i = 0; i < tab.length; i++) tab[i] = rnd();
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const g = (a: number, b: number) => tab[((b & 255) * G) + (a & 255)];
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
    return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
  };
}
