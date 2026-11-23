// Hand-drawn SVG art: cat faces in each coat colour, and small icons.

import { COATS } from './store.js';

const COAT_STYLES = {
  ginger: { fur: '#F4A259', line: '#C9772F', mark: '#DE8436', eye: '#5E9E5B' },
  black: { fur: '#3B3536', line: '#1F1B1C', mark: '#3B3536', eye: '#C9D64A', whisker: '#BDB6B0', mouth: '#CFC6BF' },
  white: { fur: '#FFFDF8', line: '#D8CDC1', mark: '#FFFDF8', eye: '#5C9BD6' },
  gray: { fur: '#A6ACB6', line: '#787E88', mark: '#8D939D', eye: '#D9A93B' },
  brown: { fur: '#9A6A47', line: '#6C4930', mark: '#7F5538', eye: '#D9A93B' },
  cream: { fur: '#F6E3C3', line: '#D4B98D', mark: '#EDD2A6', eye: '#5E9E5B' },
  calico: { fur: '#FFFDF8', line: '#D8CDC1', mark: '#FFFDF8', eye: '#5E9E5B', patches: true },
  tabby: { fur: '#BFA27F', line: '#866B4D', mark: '#7D6448', eye: '#5E9E5B', stripes: true },
};

export const COAT_NAMES = {
  ginger: 'Ginger',
  black: 'Black',
  white: 'White',
  gray: 'Gray',
  brown: 'Brown',
  cream: 'Cream',
  calico: 'Calico',
  tabby: 'Tabby',
};

/** A coat for cats that don't have one chosen, picked from the name so it stays the same. */
export function coatFor(cat) {
  if (cat.coat && COAT_STYLES[cat.coat]) return cat.coat;
  let h = 0;
  for (const ch of cat.name ?? '') h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return COATS[h % COATS.length];
}

let uid = 0;

/** A round cat face. `sleepy` closes its eyes. */
export function catFace(coat, { size = 48, sleepy = false, label = '' } = {}) {
  const c = COAT_STYLES[coat] ?? COAT_STYLES.ginger;
  const id = `cf${++uid}`;
  const whisker = c.whisker ?? '#7A6A60';
  const eyes = sleepy
    ? `<path d="M31 57 q6 5 12 0 M57 57 q6 5 12 0" fill="none" stroke="${c.mouth ?? '#3B2A22'}" stroke-width="3" stroke-linecap="round"/>`
    : `<ellipse cx="37" cy="56" rx="5.5" ry="7" fill="${c.eye}"/><ellipse cx="63" cy="56" rx="5.5" ry="7" fill="${c.eye}"/>
       <ellipse cx="37" cy="57" rx="2.4" ry="5" fill="#231A16"/><ellipse cx="63" cy="57" rx="2.4" ry="5" fill="#231A16"/>
       <circle cx="38.5" cy="53" r="1.6" fill="#fff"/><circle cx="64.5" cy="53" r="1.6" fill="#fff"/>`;
  const markings = [
    c.patches
      ? `<g clip-path="url(#${id})"><path d="M8 20 Q30 30 34 52 Q20 58 8 50 Z" fill="#F0A04B"/><path d="M60 72 Q76 58 96 62 L96 96 L62 96 Z" fill="#3B3536"/><circle cx="58" cy="30" r="9" fill="#F0A04B"/></g>`
      : '',
    c.stripes || coat === 'ginger'
      ? `<g clip-path="url(#${id})" stroke="${c.mark}" stroke-width="3.5" stroke-linecap="round" fill="none"><path d="M50 30 v9 M42 31 l2 8 M58 31 l-2 8"/>${c.stripes ? '<path d="M16 54 h9 M15 61 h9 M84 54 h-9 M85 61 h-9"/>' : ''}</g>`
      : '',
  ].join('');
  return `<svg class="cat-face" viewBox="0 0 100 100" width="${size}" height="${size}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>
    <defs><clipPath id="${id}"><ellipse cx="50" cy="58" rx="36" ry="32"/></clipPath></defs>
    <path d="M18 46 L22 12 L44 30 Z" fill="${c.patches ? '#F0A04B' : c.fur}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M82 46 L78 12 L56 30 Z" fill="${c.fur}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M24 38 L26 20 L37 30 Z" fill="#F6B8B0"/><path d="M76 38 L74 20 L63 30 Z" fill="#F6B8B0"/>
    <ellipse cx="50" cy="58" rx="36" ry="32" fill="${c.fur}" stroke="${c.line}" stroke-width="3"/>
    ${markings}
    <ellipse cx="50" cy="58" rx="36" ry="32" fill="none" stroke="${c.line}" stroke-width="3"/>
    <circle cx="28" cy="69" r="5" fill="#F49C9C" opacity=".35"/><circle cx="72" cy="69" r="5" fill="#F49C9C" opacity=".35"/>
    ${eyes}
    <path d="M46 65 h8 l-4 4.5 Z" fill="#E77F8B" stroke="#E77F8B" stroke-width="2" stroke-linejoin="round"/>
    <path d="M50 69.5 q-3 5 -7.5 3 M50 69.5 q3 5 7.5 3" fill="none" stroke="${c.mouth ?? '#3B2A22'}" stroke-width="2" stroke-linecap="round"/>
    <path d="M27 64 L9 60 M27 69 L9 71 M73 64 L91 60 M73 69 L91 71" stroke="${whisker}" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

const ICON_PATHS = {
  deworm: '<g transform="rotate(-45 12 12)"><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8 H7 a4 4 0 0 0 0 8 H12 Z" fill="currentColor"/></g>',
  fvrcp: '<path d="M14.5 4.5 L19.5 9.5 M17 7 L8.5 15.5 L6 15.5 L6 18 M8.5 15.5 L6 18 L4 20 M11 9.5 L14.5 13 M12.5 8 L16 11.5"/>',
  rabies: '<path d="M12 3.5 L19 6 V11.5 C19 16 16 19 12 20.5 C8 19 5 16 5 11.5 V6 Z"/><path d="M9 12 L11.2 14.2 L15.2 10"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10 H20 M8.5 3.5 V7 M15.5 3.5 V7"/>',
  camera: '<path d="M4 8.5 a2 2 0 0 1 2 -2 h2 l1.5 -2 h5 l1.5 2 h2 a2 2 0 0 1 2 2 V17 a2 2 0 0 1 -2 2 H6 a2 2 0 0 1 -2 -2 Z"/><circle cx="12" cy="12.5" r="3.5"/>',
  plus: '<path d="M12 5 V19 M5 12 H19"/>',
  back: '<path d="M14.5 5.5 L8 12 L14.5 18.5"/>',
  check: '<path d="M5.5 12.5 L10 17 L18.5 8"/>',
  sync: '<path d="M19 12 A7 7 0 0 1 7 17 M5 12 A7 7 0 0 1 17 7"/><path d="M17 3.5 V7 H13.5 M7 20.5 V17 H10.5"/>',
};

export function icon(name, { size = 20, label = '' } = {}) {
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${ICON_PATHS[name] ?? ''}</svg>`;
}

/** A paw print, filled. */
export function paw(size = 18) {
  return `<svg class="paw" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><ellipse cx="6" cy="10" rx="2.3" ry="2.9"/><ellipse cx="10" cy="6" rx="2.3" ry="2.9"/><ellipse cx="14.5" cy="6" rx="2.3" ry="2.9"/><ellipse cx="18.3" cy="10" rx="2.3" ry="2.9"/><path d="M12.2 11.5c-3 0-6.2 3.6-6.2 6 0 1.8 1.4 2.6 3 2.6 1.3 0 2.1-.7 3.2-.7s1.9.7 3.2.7c1.6 0 3-.8 3-2.6 0-2.4-3.2-6-6.2-6z"/></svg>`;
}
