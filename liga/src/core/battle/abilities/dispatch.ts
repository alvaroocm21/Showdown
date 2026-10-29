import { getAbility } from '../../data';
import type { Rng } from '../../rng';
import type { PokeType, StageKey } from '../../types';
import { abilityActivates, type Ctx } from '../ops';
import { activeOf, type Battle, type Battler, type Side, type StatusName, type Terrain, type Weather } from '../state';
import { DEFS } from './registry';
import type { AbilityDef, BlockCtx, DamageCtx, MoveCtx, Mods } from './types';

/** Habilidad actual del Pokémon (puede haber cambiado en combate: Calco, Momia…). */
export const abilitySlug = (b: Battler): string => getAbility(b.abilityId).slug;

/** Definición de la habilidad si actúa: no actúa si el Pokémon está bajo Gas Reactivo. */
export const defOf = (b: Battler): AbilityDef | undefined => (b.suppressed ? undefined : DEFS[abilitySlug(b)]);

// Rompemoldes: mientras un ataque se ejecuta, las habilidades del objetivo que lo podrían estorbar no actúan.
let breaking = false;
export const setBreaking = (on: boolean): void => {
  breaking = on;
};
export const isBreaking = (): boolean => breaking;
/** Definición de la habilidad del objetivo, ignorada si el atacante tiene Rompemoldes (salvo las que no se pueden anular). */
const targetDef = (b: Battler): AbilityDef | undefined => {
  const d = defOf(b);
  return d && breaking && d.breakable !== false ? undefined : d;
};

export const ignoresBurnPenalty = (b: Battler): boolean => !!defOf(b)?.ignoresBurn;
export const halvesBurnDamage = (b: Battler): boolean => !!defOf(b)?.halvesBurn;
export const hasSturdy = (b: Battler): boolean => !!targetDef(b)?.sturdy;
export const cannotFlinch = (b: Battler): boolean => !!targetDef(b)?.noFlinch;
export const invertsDrain = (b: Battler): boolean => !!targetDef(b)?.invertsDrain;
export const isTruant = (b: Battler): boolean => !!defOf(b)?.truant;
export const ignoresParalysisSpeed = (b: Battler): boolean => !!defOf(b)?.ignoresParalysisSpeed;
export const healsFromPoison = (b: Battler): boolean => !!defOf(b)?.poisonHeal;
export const isChoiceLocked = (b: Battler): boolean => !!defOf(b)?.choiceLock;
export const flinchBonus = (b: Battler): number => defOf(b)?.flinchBonus ?? 0;
export const isWeatherDamageImmune = (b: Battler): boolean => !!defOf(b)?.weatherDamageImmune;
export const hasAnchor = (b: Battler): boolean => !!targetDef(b)?.anchor;
export const hasPressure = (b: Battler): boolean => !!defOf(b)?.pressure;

export const hasMoldBreaker = (b: Battler): boolean => !!defOf(b)?.moldBreaker;

/** ¿Hay en el campo (sin anular) un Pokémon con alguna de estas habilidades? */
export function fieldHasAbility(battle: Battle, slugs: readonly string[]): boolean {
  return ([0, 1] as const).some((s) => {
    const b = activeOf(battle, s);
    return b.hp > 0 && !b.suppressed && slugs.includes(abilitySlug(b));
  });
}

/** Gas Reactivo: mientras esté en el campo, las demás habilidades no actúan. */
export function refreshSuppression(battle: Battle): void {
  const gas = ([0, 1] as const).some((s) => {
    const b = activeOf(battle, s);
    return b.hp > 0 && abilitySlug(b) === 'neutralizing-gas';
  });
  for (const s of [0, 1] as const) {
    const b = activeOf(battle, s);
    b.suppressed = gas && abilitySlug(b) !== 'neutralizing-gas';
  }
}

// ---------------------------------------------------------------------------------------------
// Daño
// ---------------------------------------------------------------------------------------------

export interface ResolvedMods {
  atk: number;
  def: number;
  power: number;
  stab: number;
  crit: number;
  final: number;
}

export function damageMods(c: DamageCtx): ResolvedMods {
  const r: ResolvedMods = { atk: 1, def: 1, power: 1, stab: 1.5, crit: 1.5, final: 1 };
  const apply = (m: Mods | void) => {
    if (!m) return;
    r.atk *= m.atk ?? 1;
    r.def *= m.def ?? 1;
    r.power *= m.power ?? 1;
    r.final *= m.final ?? 1;
    if (m.stab) r.stab = Math.max(r.stab, m.stab);
    if (m.crit) r.crit = Math.max(r.crit, m.crit);
  };
  apply(defOf(c.user)?.outgoing?.(c));
  apply(targetDef(c.target)?.incoming?.(c));
  return r;
}

// ---------------------------------------------------------------------------------------------
// Su ataque
// ---------------------------------------------------------------------------------------------

export function resolveMoveType(c: MoveCtx): { type: PokeType; power: number } | null {
  const r = defOf(c.user)?.moveType?.(c);
  return r ? { type: r.type, power: r.power ?? 1 } : null;
}

export const priorityBonus = (c: MoveCtx): number => defOf(c.user)?.priority?.(c) ?? 0;
export const bracketBonus = (c: MoveCtx, rng: Rng): number => defOf(c.user)?.bracket?.(c, rng) ?? 0;

export function speedMultiplier(battle: Battle, self: Battler, weather: Weather | null, terrain: Terrain | null): number {
  return defOf(self)?.speed?.({ battle, self, weather, terrain }) ?? 1;
}

/** Factor de precisión: habilidad del atacante y evasión del objetivo (esta última se anula con Rompemoldes). */
export function accuracyFactor(c: MoveCtx): number {
  return (defOf(c.user)?.accuracy?.(c) ?? 1) * (targetDef(c.target)?.evasion?.(c) ?? 1);
}

export const neverMisses = (user: Battler, target: Battler): boolean => !!(defOf(user)?.noGuard || defOf(target)?.noGuard);
export const critBonus = (c: MoveCtx): number => defOf(c.user)?.critBonus?.(c) ?? 0;
export const forcesCrit = (c: MoveCtx): boolean => !!defOf(c.user)?.forceCrit?.(c);
export const blocksCrit = (target: Battler): boolean => !!targetDef(target)?.noCrit;
export const ignoresStages = (b: Battler): boolean => !!defOf(b)?.ignoresStages;
export const hitsGhost = (b: Battler): boolean => !!defOf(b)?.hitsGhost;
export const alwaysMaxHits = (b: Battler): boolean => !!defOf(b)?.maxHits;
export const hasNoContact = (b: Battler): boolean => !!defOf(b)?.noContact;
export const blocksRecoil = (b: Battler): boolean => !!defOf(b)?.noRecoil;
export const blocksIndirectDamage = (b: Battler): boolean => !!defOf(b)?.noIndirectDamage;
export const secondaryChanceMultiplier = (b: Battler): number => defOf(b)?.secondaryChance ?? 1;
export const blocksSecondary = (target: Battler): boolean => !!targetDef(target)?.blocksSecondary;
export const hasSheerForce = (b: Battler): boolean => !!defOf(b)?.sheerForce;
export const sleepDecrement = (b: Battler): number => defOf(b)?.sleepDecrement ?? 1;

// ---------------------------------------------------------------------------------------------
// Inmunidades
// ---------------------------------------------------------------------------------------------

/** ¿Anula el objetivo este ataque por su habilidad? (sin efectos: lo usa también la IA) */
export const abilityBlocksMove = (c: BlockCtx): boolean => !!targetDef(c.target)?.immune?.(c);

/** Efecto de haber anulado el ataque (absorber, subir una estadística…). */
export function runImmuneEffect(ctx: Ctx, user: Battler, self: Battler, move: BlockCtx['move']): void {
  const d = defOf(self);
  if (d?.onImmune) d.onImmune(ctx, user, self, move);
  else abilityActivates(ctx, self, 'No le afecta.');
}

export const reflectsStatusMoves = (target: Battler): boolean => !!targetDef(target)?.reflectsStatus;

export function absorbsHit(ctx: Ctx, user: Battler, self: Battler, move: BlockCtx['move']): boolean {
  return !!targetDef(self)?.absorbHit?.(ctx, user, self, move);
}

export const trapsFoe = (trapper: Battler, foe: Battler): boolean => {
  if (foe.types.includes('ghost')) return false;
  return !!defOf(trapper)?.trapsFoe?.(trapper, foe);
};

// ---------------------------------------------------------------------------------------------
// Estados y estadísticas
// ---------------------------------------------------------------------------------------------

/** ¿Su habilidad impide este estado? `fromFoe`: lo provoca el rival (Rompemoldes puede anularlo). */
export function abilityBlocksStatus(b: Battler, status: StatusName, battle: Battle, fromFoe: boolean, weather: Weather | null, terrain: Terrain | null): boolean {
  const d = fromFoe ? targetDef(b) : defOf(b);
  return !!d?.blocksStatus?.(b, status, battle, weather, terrain);
}

export const blocksConfusion = (b: Battler, fromFoe: boolean): boolean => !!(fromFoe ? targetDef(b) : defOf(b))?.blocksConfusion;
export const stageDeltaFor = (b: Battler, delta: number): number => defOf(b)?.stageDelta?.(delta) ?? delta;
export const blocksStatDrop = (b: Battler, stat: StageKey): boolean => !!targetDef(b)?.blocksStatDrop?.(stat);
export const reflectsStatDrops = (b: Battler): boolean => !!targetDef(b)?.reflectsStatDrops;
export const canPoisonAnything = (b: Battler): boolean => !!defOf(b)?.poisonsAnything;

// ---------------------------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------------------------

export function runSwitchIn(ctx: Ctx, side: Side): void {
  const b = activeOf(ctx.battle, side);
  defOf(b)?.onSwitchIn?.(ctx, b, side);
}

export const runSwitchOut = (ctx: Ctx, b: Battler): void => void defOf(b)?.onSwitchOut?.(ctx, b);
export const runEndTurn = (ctx: Ctx, b: Battler): void => void defOf(b)?.onEndTurn?.(ctx, b);

/** Tras un golpe que hace daño: reacciones del objetivo y del atacante. */
export function runAfterHit(ctx: Ctx, attacker: Battler, target: Battler, move: BlockCtx['move'], amount: number, crit: boolean): void {
  const td = defOf(target);
  td?.onDamaged?.(ctx, target, attacker, move, amount, crit);
  if (move.flags.contact && !hasNoContact(attacker)) td?.onContact?.(ctx, target, attacker, move);
  defOf(attacker)?.onDealtDamage?.(ctx, attacker, target, move, amount);
}

export const runKnockOut = (ctx: Ctx, attacker: Battler, victim: Battler): void => void defOf(attacker)?.onKnockOut?.(ctx, attacker, victim);
export const runFainted = (ctx: Ctx, self: Battler, attacker: Battler, move: BlockCtx['move'] | null, amount: number): void =>
  void defOf(self)?.onFainted?.(ctx, self, attacker, move, amount);

export const runBeforeMove = (ctx: Ctx, self: Battler, move: BlockCtx['move']): void => void defOf(self)?.beforeMove?.(ctx, self, move);
export const runFlinched = (ctx: Ctx, self: Battler): void => void defOf(self)?.onFlinched?.(ctx, self);

/** El clima o el terreno han cambiado: avisa a los dos Pokémon activos. */
export function runFieldChange(ctx: Ctx): void {
  for (const s of [0, 1] as const) {
    const b = activeOf(ctx.battle, s);
    if (b.hp > 0) defOf(b)?.onFieldChange?.(ctx, b);
  }
}

export function runAnyFainted(ctx: Ctx, fainted: Battler): void {
  for (const s of [0, 1] as const) {
    const b = activeOf(ctx.battle, s);
    if (b !== fainted && b.hp > 0) defOf(b)?.onAnyFainted?.(ctx, b, fainted);
  }
}

export const runStatDropped = (ctx: Ctx, self: Battler, source: Battler): void => void defOf(self)?.onStatDropped?.(ctx, self, source);
export function runFoeStatRaised(ctx: Ctx, foe: Battler, self: Battler, stat: StageKey, delta: number): void {
  defOf(foe)?.onFoeStatRaised?.(ctx, foe, self, stat, delta);
}
export const intimidateReaction = (ctx: Ctx, self: Battler, source: Battler): 'immune' | 'handled' | void =>
  targetDef(self)?.intimidateReaction?.(ctx, self, source);
