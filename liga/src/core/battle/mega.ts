import { getSpecies, megasOf } from '../data';
import { computeStats } from '../stats';
import type { Species } from '../types';
import { runFieldChange } from './abilities';
import { emit, type Ctx } from './ops';
import { activeOf, type Battle, type Side } from './state';

/** Megaevoluciones que puede hacer ahora el Pokémon activo del bando (vacío si no puede). Una por combate y bando. */
export function megaOptions(battle: Battle, side: Side): Species[] {
  const s = battle.sides[side];
  const b = activeOf(battle, side);
  if (s.megaUsed || b.mega || b.hp <= 0 || b.transformBackup) return [];
  return megasOf(b.speciesId);
}

/** Megaevoluciona al Pokémon activo: cambia su forma, tipos y estadísticas (conserva su habilidad y sus PS perdidos). */
export function megaEvolve(ctx: Ctx, side: Side, formId: number): void {
  const b = activeOf(ctx.battle, side);
  const form = getSpecies(formId);
  const oldMax = b.maxHp;
  b.speciesId = formId;
  b.mega = true;
  b.name = form.name;
  b.stats = computeStats(formId, b.set.build);
  b.maxHp = b.stats.hp;
  // Si cambian los PS máximos (Mega-Zygarde…), se mantienen los PS perdidos
  b.hp = Math.max(1, Math.min(b.maxHp, b.hp + (b.maxHp - oldMax)));
  b.types = [...form.types];
  b.typeChanged = false;
  ctx.battle.sides[side].megaUsed = true;
  emit(ctx, { type: 'mega', side, pokemon: b.name, speciesId: formId, name: b.name, types: [...b.types], hp: b.hp, maxHp: b.maxHp });
  runFieldChange(ctx);
}
