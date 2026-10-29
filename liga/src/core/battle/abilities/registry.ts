import { classic } from './defs/classic';
import { damageDefs } from './defs/damage';
import { defenseDefs } from './defs/defense';
import { entryDefs } from './defs/entry';
import { fieldDefs } from './defs/field';
import { miscDefs } from './defs/misc';
import { INAPPLICABLE, inapplicableReason } from './inapplicable';
import type { AbilityDef } from './types';

/** Junta las definiciones de varios grupos: si una habilidad aparece en más de uno, se fusionan sus ganchos. */
function merge(...groups: Record<string, AbilityDef>[]): Record<string, AbilityDef> {
  const out: Record<string, AbilityDef> = {};
  for (const group of groups) for (const [slug, def] of Object.entries(group)) out[slug] = { ...out[slug], ...def };
  return out;
}

/** Todas las habilidades con efecto en combate, por su identificador de PokéAPI. */
export const DEFS: Record<string, AbilityDef> = merge(classic, damageDefs, defenseDefs, fieldDefs, entryDefs, miscDefs);
export const IMPLEMENTED_ABILITIES: ReadonlySet<string> = new Set(Object.keys(DEFS));
export const isAbilityImplemented = (slug: string): boolean => slug in DEFS;
export { INAPPLICABLE, inapplicableReason };
