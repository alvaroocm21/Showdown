import type { PokeType } from '../../../types';
import { isGrounded } from '../../field';
import { SLICING_MOVES, hasSecondary } from '../../moves';
import { sideOfBattler } from '../../state';
import { fieldHasAbility } from '../dispatch';
import type { AbilityDef, DamageCtx } from '../types';

/** Habilidades que cambian el daño: bonificaciones de ataques, reducciones de daño recibido y auras. */

const boost = (when: (c: DamageCtx) => boolean, power: number): AbilityDef => ({ outgoing: (c) => (when(c) ? { power } : undefined) });
const typeBoost = (type: PokeType, power: number): AbilityDef => boost((c) => c.move.type === type, power);
const contact = (c: DamageCtx) => c.move.flags.contact;
const sunny = (c: DamageCtx) => c.weather === 'sun' || c.weather === 'harsh-sun';
const SAND_TYPES: readonly PokeType[] = ['rock', 'ground', 'steel'];

/** Un ataque del tipo dado es más fuerte (o más débil con Rompeaura) mientras haya un Aura en el campo. */
const aura = (type: PokeType): AbilityDef => {
  const factor = (c: DamageCtx) => (c.move.type !== type ? undefined : { power: fieldHasAbility(c.battle, ['aura-break']) ? 0.75 : 4 / 3 });
  return {
    outgoing: factor,
    // Si quien ataca ya tiene el Aura, no se aplica dos veces
    incoming: (c) => (c.user.suppressed || c.user.abilityId === c.target.abilityId ? undefined : factor(c)),
    breakable: false,
  };
};

/** Protosíntesis / Impulso Cuark: la estadística potenciada sube un 30 % (la Velocidad un 50 %). */
const energy: Pick<AbilityDef, 'outgoing' | 'incoming'> = {
  outgoing: (c) => ((c.physical && c.user.boosted === 'atk') || (!c.physical && c.user.boosted === 'spa') ? { atk: 1.3 } : undefined),
  incoming: (c) => ((c.physical && c.target.boosted === 'def') || (!c.physical && c.target.boosted === 'spd') ? { def: 1.3 } : undefined),
};

export const damageDefs: Record<string, AbilityDef> = {
  // ---- Potencia de sus ataques ----
  'iron-fist': boost((c) => c.move.flags.punch, 1.2),
  'strong-jaw': boost((c) => c.move.flags.bite, 1.5),
  'mega-launcher': boost((c) => c.move.flags.pulse, 1.5),
  'tough-claws': boost(contact, 1.3),
  sharpness: boost((c) => SLICING_MOVES.has(c.move.slug.replace(/^z-/, '')), 1.5),
  technician: boost((c) => (c.move.power ?? 0) > 0 && (c.move.power ?? 0) <= 60, 1.5),
  reckless: boost((c) => c.move.meta.drain < 0, 1.2),
  steelworker: typeBoost('steel', 1.5),
  transistor: typeBoost('electric', 1.3),
  'dragons-maw': typeBoost('dragon', 1.5),
  'rocky-payload': typeBoost('rock', 1.5),
  'fire-mane': typeBoost('fire', 1.5),
  analytic: boost((c) => c.movesLast, 1.3),
  'sheer-force': { sheerForce: true, outgoing: (c) => (hasSecondary(c.move) ? { power: 1.3 } : undefined) },
  'sand-force': { weatherDamageImmune: true, outgoing: (c) => (c.weather === 'sand' && SAND_TYPES.includes(c.move.type) ? { power: 1.3 } : undefined) },
  'supreme-overlord': {
    outgoing: (c) => {
      const fainted = Math.min(5, c.battle.sides[sideOfBattler(c.battle, c.user)].faintedCount);
      return fainted > 0 ? { power: 1 + 0.1 * fainted } : undefined;
    },
  },
  adaptability: { outgoing: () => ({ stab: 2 }) },
  sniper: { outgoing: (c) => (c.crit ? { crit: 2.25 } : undefined) },
  'tinted-lens': { outgoing: (c) => (c.effectiveness > 0 && c.effectiveness < 1 ? { final: 2 } : undefined) },
  neuroforce: { outgoing: (c) => (c.effectiveness > 1 ? { final: 1.25 } : undefined) },

  // ---- Su Ataque o Ataque Esp. ----
  stakeout: { outgoing: (c) => (c.battle.sides[sideOfBattler(c.battle, c.target)].enteredTurn === c.battle.turn ? { atk: 2 } : undefined) },
  'gorilla-tactics': { choiceLock: true, outgoing: (c) => (c.physical ? { atk: 1.5 } : undefined) },
  'toxic-boost': { outgoing: (c) => (c.physical && (c.user.status === 'poison' || c.user.status === 'toxic') ? { atk: 1.5 } : undefined) },
  'flare-boost': { outgoing: (c) => (!c.physical && c.user.status === 'burn' ? { atk: 1.5 } : undefined) },
  'solar-power': { outgoing: (c) => (!c.physical && sunny(c) ? { atk: 1.5 } : undefined) },
  'flower-gift': {
    outgoing: (c) => (c.physical && sunny(c) ? { atk: 1.5 } : undefined),
    incoming: (c) => (!c.physical && sunny(c) ? { def: 1.5 } : undefined),
  },
  'slow-start': { outgoing: (c) => (c.user.slowStart > 0 ? { atk: 0.5 } : undefined) },
  defeatist: { outgoing: (c) => (c.user.hp * 2 <= c.user.maxHp ? { atk: 0.5 } : undefined) },
  protosynthesis: energy,
  'quark-drive': energy,
  'orichalcum-pulse': { outgoing: (c) => (c.physical && sunny(c) ? { atk: 4 / 3 } : undefined) },
  'hadron-engine': { outgoing: (c) => (!c.physical && c.terrain === 'electric' && isGrounded(c.user) ? { atk: 4 / 3 } : undefined) },

  // ---- Rebajan las estadísticas de los demás ----
  'sword-of-ruin': { breakable: false, outgoing: (c) => (c.physical ? { def: 0.75 } : undefined) },
  'beads-of-ruin': { breakable: false, outgoing: (c) => (!c.physical ? { def: 0.75 } : undefined) },
  'tablets-of-ruin': { breakable: false, incoming: (c) => (c.physical ? { atk: 0.75 } : undefined) },
  'vessel-of-ruin': { breakable: false, incoming: (c) => (!c.physical ? { atk: 0.75 } : undefined) },

  // ---- Auras ----
  'dark-aura': aura('dark'),
  'fairy-aura': aura('fairy'),
  'aura-break': { breakable: false },

  // ---- Daño que reciben ----
  multiscale: { incoming: (c) => (c.target.hp === c.target.maxHp ? { final: 0.5 } : undefined) },
  'shadow-shield': { breakable: false, incoming: (c) => (c.target.hp === c.target.maxHp ? { final: 0.5 } : undefined) },
  filter: { incoming: (c) => (c.effectiveness > 1 ? { final: 0.75 } : undefined) },
  'solid-rock': { incoming: (c) => (c.effectiveness > 1 ? { final: 0.75 } : undefined) },
  'prism-armor': { breakable: false, incoming: (c) => (c.effectiveness > 1 ? { final: 0.75 } : undefined) },
  'fur-coat': { incoming: (c) => (c.physical ? { def: 2 } : undefined) },
  'ice-scales': { incoming: (c) => (!c.physical ? { final: 0.5 } : undefined) },
  fluffy: { incoming: (c) => ({ final: (contact(c) ? 0.5 : 1) * (c.move.type === 'fire' ? 2 : 1) }) },
  heatproof: { halvesBurn: true, incoming: (c) => (c.move.type === 'fire' ? { final: 0.5 } : undefined) },
  'dry-skin': { incoming: (c) => (c.move.type === 'fire' ? { final: 1.25 } : undefined) },
  'purifying-salt': { incoming: (c) => (c.move.type === 'ghost' ? { final: 0.5 } : undefined) },
  'aura-guard': { incoming: (c) => (contact(c) ? { final: 0.5 } : undefined) },
  'grass-pelt': { incoming: (c) => (c.physical && c.terrain === 'grassy' && isGrounded(c.target) ? { def: 1.5 } : undefined) },
  'punk-rock': {
    outgoing: (c) => (c.move.flags.sound ? { power: 1.3 } : undefined),
    incoming: (c) => (c.move.flags.sound ? { final: 0.5 } : undefined),
  },
  'water-bubble': {
    outgoing: (c) => (c.move.type === 'water' ? { power: 2 } : undefined),
    incoming: (c) => (c.move.type === 'fire' ? { final: 0.5 } : undefined),
    blocksStatus: (_s, status) => status === 'burn',
  },
};
