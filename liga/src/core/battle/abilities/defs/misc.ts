import type { PokeType } from '../../../types';
import { abilityActivates, setTypes } from '../../ops';
import type { AbilityDef, MoveCtx } from '../types';

/** Cambios de tipo, prioridad y orden, críticos, precisión y otras reglas sueltas. */

/** Piel Celeste, Piel Feérica… Los ataques de tipo Normal cambian de tipo y ganan un 20 % de potencia. */
const ate = (type: PokeType): AbilityDef => ({ moveType: (c) => (c.move.type === 'normal' ? { type, power: 1.2 } : undefined) });

/** Líbero / Mutatipo: el Pokémon adopta el tipo del ataque que va a usar (una vez desde que entra). */
const protean: AbilityDef = {
  beforeMove: (ctx, self, move) => {
    if (self.typeChanged || (self.types.length === 1 && self.types[0] === move.type)) return;
    self.typeChanged = true;
    abilityActivates(ctx, self);
    setTypes(ctx, self, [move.type]);
  },
};

const isStatus = (c: MoveCtx) => c.move.category === 'status';

export const miscDefs: Record<string, AbilityDef> = {
  // ---- Tipo de sus ataques ----
  pixilate: ate('fairy'),
  refrigerate: ate('ice'),
  aerilate: ate('flying'),
  galvanize: ate('electric'),
  dragonize: ate('dragon'),
  normalize: { moveType: () => ({ type: 'normal', power: 1.2 }) },
  'liquid-voice': { moveType: (c) => (c.move.flags.sound ? { type: 'water' } : undefined) },
  protean,
  libero: protean,

  // ---- Prioridad y orden ----
  prankster: { priority: (c) => (isStatus(c) ? 1 : 0) },
  'gale-wings': { priority: (c) => (c.move.type === 'flying' && c.user.hp === c.user.maxHp ? 1 : 0) },
  triage: { priority: (c) => (c.move.flags.heal || c.move.meta.drain > 0 ? 3 : 0) },
  stall: { bracket: () => -1 },
  'quick-draw': { bracket: (_c, rng) => (rng.next() < 0.3 ? 1 : 0) },
  'mycelium-might': { bracket: (c) => (isStatus(c) ? -1 : 0) },

  // ---- Ataques ----
  'mold-breaker': { moldBreaker: true },
  teravolt: { moldBreaker: true },
  turboblaze: { moldBreaker: true },
  'no-guard': { noGuard: true },
  'skill-link': { maxHits: true },
  'parental-bond': {},
  dancer: {},
  'mega-sol': {},
  'poison-puppeteer': {},
  'super-luck': { critBonus: () => 1 },
  merciless: { forceCrit: (c) => c.target.status === 'poison' || c.target.status === 'toxic' },
  'long-reach': { noContact: true },
  unaware: { ignoresStages: true },
  stench: { flinchBonus: 10 },
  corrosion: { poisonsAnything: true },
  'as-one-glastrier': { onSwitchIn: (ctx, self) => abilityActivates(ctx, self, 'Dos habilidades en una.') },
  'as-one-spectrier': { onSwitchIn: (ctx, self) => abilityActivates(ctx, self, 'Dos habilidades en una.') },
};
