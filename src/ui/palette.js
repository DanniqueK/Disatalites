// Status colours (working / warning / broken). The colourblind set avoids red against green
// (Okabe-Ito blue, yellow and orange). Theme colours stay as they are.
const STANDARD = { good: '#2fdc4f', warn: '#ffc040', bad: '#ff4a4a' };
const COLORBLIND = { good: '#56b4e9', warn: '#f0e442', bad: '#e67e00' };

export const C = { ...STANDARD };

/** @param {'standard' | 'colorblind'} name */
export function setPalette(name) {
  Object.assign(C, name === 'colorblind' ? COLORBLIND : STANDARD);
}
