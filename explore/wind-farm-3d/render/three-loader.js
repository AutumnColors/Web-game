// Load the three.js core module from the first CDN that answers.
// The core build has no imports of its own, so no import map is needed. (The previous
// prototype loaded examples/jsm/controls/OrbitControls.js, which imports the bare
// specifier "three" and fails without an import map — that was why it never started.)
export const THREE_VERSION = '0.170.0';
const SOURCES = [
  `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.min.js`,
  `https://unpkg.com/three@${THREE_VERSION}/build/three.module.min.js`,
];

function withTimeout(promise, ms, label) {
  let id;
  return Promise.race([promise, new Promise((_, reject) => { id = setTimeout(() => reject(new Error(label + ' timed out')), ms); })])
    .finally(() => clearTimeout(id));
}

export async function loadThree({ timeoutMs = 12000 } = {}) {
  const errors = [];
  for (const url of SOURCES) {
    try {
      const mod = await withTimeout(import(url), timeoutMs, url);
      if (mod && mod.WebGLRenderer) return { THREE: mod, url };
      errors.push(url + ': module has no WebGLRenderer');
    } catch (e) {
      errors.push(url + ': ' + (e && e.message ? e.message : e));
    }
  }
  throw new Error('Could not load three.js from any CDN.\n' + errors.join('\n'));
}
