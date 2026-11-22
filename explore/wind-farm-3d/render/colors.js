// Colour scales shared by the 3D and 2D views (no physical meaning).
export const COLOR_MODES = {
  speed: {
    label: 'wind speed ÷ reference hub-height speed',
    stops: [[0.45, 0x3b1f8f], [0.7, 0x2c7fb8], [0.9, 0x41b6c4], [1.05, 0xc7e9b4], [1.25, 0xffffcc]],
  },
  wake: {
    label: 'wake: speed ÷ turbine-free speed at the same point',
    stops: [[0.5, 0xd7301f], [0.7, 0xfc8d59], [0.85, 0xfdd49e], [0.97, 0x6d8796], [1.0, 0x4f6878]],
  },
};

const rgbOf = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

// Returns f(value, out) writing [r, g, b] in 0..1 (sRGB).
export function rampRGB(mode) {
  const stops = COLOR_MODES[mode].stops.map(([v, c]) => [v, rgbOf(c)]);
  return (v, out) => {
    let i = 1;
    if (!(v > stops[0][0])) { const c = stops[0][1]; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; }
    while (i < stops.length && v > stops[i][0]) i++;
    if (i === stops.length) { const c = stops[i - 1][1]; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; }
    const [a, ca] = stops[i - 1], [b, cb] = stops[i], w = (v - a) / (b - a);
    for (let k = 0; k < 3; k++) out[k] = ca[k] + w * (cb[k] - ca[k]);
    return out;
  };
}

export function cssGradient(mode) {
  const st = COLOR_MODES[mode].stops, lo = st[0][0], hi = st[st.length - 1][0];
  return 'linear-gradient(90deg,' + st.map(([v, c]) => '#' + c.toString(16).padStart(6, '0') + ' ' + ((100 * (v - lo)) / (hi - lo)).toFixed(0) + '%').join(',') + ')';
}
