import { abilityImmune, abilitySlug } from './abilities';
import { abilityActivates, changeStage, cureStatus, damageHp, healHp, inflictStatus, statusBlock, typeNameEs, type Ctx } from './ops';
import { activeOf, otherSide, type Battler, type Side } from './state';
import type { Move } from '../types';

/** Al entrar un Pokémon al campo. */
export function onSwitchIn(ctx: Ctx, side: Side): void {
  const b = activeOf(ctx.battle, side);
  const foe = activeOf(ctx.battle, otherSide(side));
  if (abilitySlug(b) === 'intimidate' && foe.hp > 0) {
    abilityActivates(ctx, b, 'Intimida al rival.');
    changeStage(ctx, foe, 'atk', -1, b);
  }
}

/** Habilidad del objetivo que absorbe o anula el ataque. Devuelve true si el ataque no llega a hacer nada. */
export function onTryHit(ctx: Ctx, user: Battler, target: Battler, move: Move, effectiveness: number): boolean {
  if (user === target || !abilityImmune(target, move, effectiveness)) return false;
  switch (abilitySlug(target)) {
    case 'volt-absorb':
    case 'water-absorb':
      abilityActivates(ctx, target, 'Absorbe el ataque.');
      healHp(ctx, target, Math.max(1, Math.floor(target.maxHp / 4)));
      break;
    case 'flash-fire':
      target.flashFire = true;
      abilityActivates(ctx, target, 'Sus ataques de tipo Fuego se potencian.');
      break;
    case 'lightning-rod':
      abilityActivates(ctx, target, 'Absorbe el ataque.');
      changeStage(ctx, target, 'spa', 1, null);
      break;
    default:
      abilityActivates(ctx, target, 'No le afecta.');
  }
  return true;
}

const CONTACT_STATUS: Record<string, 'paralysis' | 'poison' | 'burn'> = {
  static: 'paralysis',
  'poison-point': 'poison',
  'flame-body': 'burn',
};

/** Tras recibir un ataque de contacto. */
export function onContact(ctx: Ctx, attacker: Battler, defender: Battler, move: Move): void {
  if (!move.flags.contact || attacker.hp <= 0) return;
  const slug = abilitySlug(defender);
  if (slug === 'rough-skin') {
    abilityActivates(ctx, defender);
    damageHp(ctx, attacker, Math.max(1, Math.floor(attacker.maxHp / 8)), 'rough-skin');
    return;
  }
  let status = CONTACT_STATUS[slug];
  if (slug === 'effect-spore') status = ctx.rng.pick(['sleep', 'paralysis', 'poison'] as const) as 'paralysis' | 'poison';
  if (!status || ctx.rng.int(1, 100) > 30) return;
  if (statusBlock(attacker, status)) return;
  abilityActivates(ctx, defender);
  inflictStatus(ctx, attacker, status, defender, false);
}

/** Tras recibir daño de un ataque. */
export function onDamaged(ctx: Ctx, target: Battler, move: Move): void {
  if (abilitySlug(target) !== 'color-change' || target.hp <= 0) return;
  if (target.types.length === 1 && target.types[0] === move.type) return;
  target.types = [move.type];
  abilityActivates(ctx, target, `Cambia a tipo ${typeNameEs(move.type)}.`);
}

/** Al final de cada turno. */
export function onEndTurn(ctx: Ctx, b: Battler): void {
  switch (abilitySlug(b)) {
    case 'speed-boost':
      abilityActivates(ctx, b);
      changeStage(ctx, b, 'spe', 1, null);
      break;
    case 'shed-skin':
      if (b.status && ctx.rng.next() < 1 / 3) {
        abilityActivates(ctx, b, 'Se despoja del estado.');
        cureStatus(ctx, b);
      }
      break;
  }
}

/** Al retirar un Pokémon del campo. */
export function onSwitchOut(b: Battler): void {
  if (abilitySlug(b) === 'natural-cure' && b.status) {
    b.status = null;
    b.sleepTurns = 0;
  }
}

