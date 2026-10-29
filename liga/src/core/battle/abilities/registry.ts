import { classic } from './defs/classic';
import type { AbilityDef } from './types';

/** Todas las habilidades con efecto en combate, por su identificador de PokéAPI. */
export const DEFS: Record<string, AbilityDef> = { ...classic };
export const IMPLEMENTED_ABILITIES: ReadonlySet<string> = new Set(Object.keys(DEFS));
export const isAbilityImplemented = (slug: string): boolean => slug in DEFS;
