import type { PokeType } from '../../../types';
import { abilityActivates, changeStage, cureStatus, damageHp, foeOf, healHp, inflictStatus, setTypes, statusBlock, typeNameEs } from '../../ops';
import { abilitySlug, intimidateReaction } from '../dispatch';
import type { AbilityDef, DamageCtx } from '../types';

/** Las habilidades del primer bloque (las más comunes y sencillas de las generaciones 1-3). */

const physical = (c: DamageCtx) => c.move.category === 'physical';
const pinch = (type: PokeType): AbilityDef => ({
  outgoing: (c) => (c.move.type === type && c.user.hp * 3 <= c.user.maxHp ? { power: 1.5 } : undefined),
});
const statusBlocker = (...statuses: string[]): AbilityDef => ({ blocksStatus: (_self, status) => statuses.includes(status) });
const dropBlocker = (stat?: string): AbilityDef => ({ blocksStatDrop: (s) => stat === undefined || s === stat });
/** Absorbe un tipo de ataque: no hace daño y se cura 1/4. */
const absorbs = (type: PokeType, effect: AbilityDef['onImmune']): AbilityDef => ({
  immune: (c) => c.move.type === type,
  onImmune: effect,
});

/** Reacciones al contacto: 30 % de causar un estado al atacante. */
const contactStatus = (pick: (ctxRng: { pick<T>(a: readonly T[]): T }) => 'paralysis' | 'poison' | 'burn' | 'sleep'): AbilityDef => ({
  onContact: (ctx, self, attacker) => {
    const status = pick(ctx.rng);
    if (ctx.rng.int(1, 100) > 30 || statusBlock(attacker, status, ctx.battle, self)) return;
    abilityActivates(ctx, self);
    inflictStatus(ctx, attacker, status, self, false);
  },
});

/** Reacción a Intimidación: no le afecta. */
const immuneToIntimidate: AbilityDef['intimidateReaction'] = (ctx, self) => {
  abilityActivates(ctx, self, 'Es inmune a Intimidación.');
  return 'immune';
};

const heal25: AbilityDef['onImmune'] = (ctx, _user, self) => {
  abilityActivates(ctx, self, 'Absorbe el ataque.');
  healHp(ctx, self, Math.max(1, Math.floor(self.maxHp / 4)));
};

export const classic: Record<string, AbilityDef> = {
  // ---- Estadísticas y daño ----
  'huge-power': { outgoing: (c) => (physical(c) ? { atk: 2 } : undefined) },
  'pure-power': { outgoing: (c) => (physical(c) ? { atk: 2 } : undefined) },
  hustle: { outgoing: (c) => (physical(c) ? { atk: 1.5 } : undefined), accuracy: (c) => (c.move.category === 'physical' ? 0.8 : 1) },
  guts: { outgoing: (c) => (physical(c) && c.user.status ? { atk: 1.5 } : undefined), ignoresBurn: true },
  'marvel-scale': { incoming: (c) => (physical(c) && c.target.status ? { def: 1.5 } : undefined) },
  'thick-fat': { incoming: (c) => (c.move.type === 'fire' || c.move.type === 'ice' ? { atk: 0.5 } : undefined) },
  overgrow: pinch('grass'),
  blaze: pinch('fire'),
  torrent: pinch('water'),
  swarm: pinch('bug'),
  'compound-eyes': { accuracy: () => 1.3 },
  'serene-grace': { secondaryChance: 2 },
  'rock-head': { noRecoil: true },

  // ---- Inmunidades ----
  levitate: { immune: (c) => c.move.category !== 'status' && c.move.type === 'ground' },
  'volt-absorb': absorbs('electric', heal25),
  'water-absorb': absorbs('water', heal25),
  'flash-fire': {
    ...absorbs('fire', (ctx, _user, self) => {
      self.flashFire = true;
      abilityActivates(ctx, self, 'Sus ataques de tipo Fuego se potencian.');
    }),
    outgoing: (c) => (c.user.flashFire && c.move.type === 'fire' ? { power: 1.5 } : undefined),
  },
  'lightning-rod': absorbs('electric', (ctx, _user, self) => {
    abilityActivates(ctx, self, 'Absorbe el ataque.');
    changeStage(ctx, self, 'spa', 1, null);
  }),
  'wonder-guard': { immune: (c) => c.move.category !== 'status' && c.effectiveness <= 1 },
  soundproof: { immune: (c) => c.move.flags.sound },
  sturdy: { sturdy: true },
  'battle-armor': { noCrit: true },
  'shell-armor': { noCrit: true },
  'shield-dust': { blocksSecondary: true },
  'inner-focus': { noFlinch: true, intimidateReaction: immuneToIntimidate },
  damp: {},
  limber: statusBlocker('paralysis'),
  insomnia: statusBlocker('sleep'),
  'vital-spirit': statusBlocker('sleep'),
  immunity: statusBlocker('poison', 'toxic'),
  'water-veil': statusBlocker('burn'),
  'magma-armor': statusBlocker('freeze'),
  'clear-body': dropBlocker(),
  'white-smoke': dropBlocker(),
  'hyper-cutter': dropBlocker('atk'),
  'keen-eye': dropBlocker('acc'),

  // ---- Al entrar, al contacto y al final del turno ----
  intimidate: {
    onSwitchIn: (ctx, self) => {
      const foe = foeOf(ctx, self);
      if (foe.hp <= 0) return;
      abilityActivates(ctx, self, 'Intimida al rival.');
      if (intimidateReaction(ctx, foe, self) === undefined) changeStage(ctx, foe, 'atk', -1, self);
    },
  },
  static: contactStatus(() => 'paralysis'),
  'poison-point': contactStatus(() => 'poison'),
  'flame-body': contactStatus(() => 'burn'),
  'effect-spore': contactStatus((rng) => rng.pick(['sleep', 'paralysis', 'poison'] as const)),
  'rough-skin': {
    onContact: (ctx, self, attacker) => {
      if (attacker.hp <= 0) return;
      abilityActivates(ctx, self);
      damageHp(ctx, attacker, Math.max(1, Math.floor(attacker.maxHp / 8)), 'rough-skin');
    },
  },
  'color-change': {
    onDamaged: (ctx, self, _attacker, move) => {
      if (self.hp <= 0 || (self.types.length === 1 && self.types[0] === move.type)) return;
      setTypes(ctx, self, [move.type]);
      abilityActivates(ctx, self, `Cambia a tipo ${typeNameEs(move.type)}.`);
    },
  },
  synchronize: {},
  'natural-cure': {
    onSwitchOut: (_ctx, self) => {
      if (self.status) {
        self.status = null;
        self.sleepTurns = 0;
      }
    },
  },
  'shed-skin': {
    onEndTurn: (ctx, self) => {
      if (self.status && ctx.rng.next() < 1 / 3) {
        abilityActivates(ctx, self, 'Se despoja del estado.');
        cureStatus(ctx, self);
      }
    },
  },
  'speed-boost': {
    onEndTurn: (ctx, self) => {
      abilityActivates(ctx, self);
      changeStage(ctx, self, 'spe', 1, null);
    },
  },
  'early-bird': { sleepDecrement: 2 },
  'liquid-ooze': { invertsDrain: true },

  // ---- Otras ----
  truant: { truant: true },
  pressure: { pressure: true },
  'shadow-tag': { trapsFoe: (_self, foe) => abilitySlug(foe) !== 'shadow-tag' },
  'arena-trap': { trapsFoe: (_self, foe) => !foe.types.includes('flying') && abilitySlug(foe) !== 'levitate' },
  'magnet-pull': { trapsFoe: (_self, foe) => foe.types.includes('steel') },
};
