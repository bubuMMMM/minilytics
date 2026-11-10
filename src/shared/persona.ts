/**
 * A stable, friendly identity derived from a visitor id. No personal data:
 * the same id always yields the same French name, initials and colours.
 */
const ADJ = [
  'calme', 'vif', 'serein', 'brillant', 'curieux', 'hardi', 'leste', 'nacré', 'paisible', 'sage',
  'vaillant', 'agile', 'doux', 'fier', 'libre', 'noble', 'sûr', 'unique', 'vaste', 'doré',
  'ambre', 'indigo', 'opale', 'safran', 'rubis', 'jade', 'corail', 'perle', 'ocre', 'azur',
] as const;
const NOUN = [
  'Renard', 'Héron', 'Lynx', 'Merle', 'Loutre', 'Cerf', 'Hérisson', 'Faucon', 'Dauphin', 'Chouette',
  'Panda', 'Jaguar', 'Koala', 'Lama', 'Manchot', 'Toucan', 'Saumon', 'Bison', 'Écureuil', 'Flamant',
  'Gecko', 'Ibis', 'Martin-pêcheur', 'Aigle', 'Daim', 'Cigale', 'Blaireau', 'Hêtre', 'Saule', 'Noyer',
] as const;

export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export interface Persona { name: string; initials: string; hue: number; hue2: number }

export function visitorPersona(id: string): Persona {
  const h = fnv(id || 'x');
  const noun = NOUN[h % NOUN.length];
  const adj = ADJ[(h >>> 8) % ADJ.length];
  const name = `${noun} ${adj}`;
  const initials = ((noun[0] ?? 'V') + (adj[0] ?? '')).toUpperCase();
  return { name, initials, hue: h % 360, hue2: (h + 46 + ((h >>> 9) % 80)) % 360 };
}

/** Tiny deterministic offset so several visitors in the same city don’t stack on one pixel. */
export function visitorJitter(id: string): [number, number] {
  const h = fnv(id);
  return [(((h % 21) - 10) * 0.015), ((((h >>> 5) % 21) - 10) * 0.012)];
}
