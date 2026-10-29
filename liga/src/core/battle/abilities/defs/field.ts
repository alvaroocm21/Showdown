import { getSpecies } from '../../../data';
import type { StageKey } from '../../../types';
import { effectiveWeather, isStrongWeather, setTerrain, setWeather } from '../../field';
import { abilityActivates, changeStage, cureStatus, damageHp, foeOf, healHp, setTypes } from '../../ops';
import type { Terrain, Weather } from '../../state';
import type { AbilityDef, SpeedCtx } from '../types';

/** Clima, terrenos, velocidad y evasión por clima, y efectos de final de turno. */

const bringsWeather = (weather: Weather): AbilityDef => ({
  onSwitchIn: (ctx, self, side) => {
    const f = ctx.battle.field;
    if (f.weather === weather || (isStrongWeather(f.weather) && !isStrongWeather(weather))) return;
    abilityActivates(ctx, self);
    setWeather(ctx, weather, side);
  },
});
const bringsTerrain = (terrain: Terrain): AbilityDef => ({
  onSwitchIn: (ctx, self) => {
    if (ctx.battle.field.terrain === terrain) return;
    abilityActivates(ctx, self);
    setTerrain(ctx, terrain);
  },
});

const speedIn = (when: (c: SpeedCtx) => boolean, mult = 2): AbilityDef => ({ speed: (c) => (when(c) ? mult : 1) });
const sunny = (w: Weather | null) => w === 'sun' || w === 'harsh-sun';
const rainy = (w: Weather | null) => w === 'rain' || w === 'heavy-rain';
const everyone = (ctx: { battle: Parameters<typeof effectiveWeather>[0] }) => effectiveWeather(ctx.battle);

/** Protosíntesis (sol) / Impulso Cuark (terreno eléctrico): potencia la estadística más alta mientras dure. */
const energy = (active: (battle: Parameters<typeof effectiveWeather>[0]) => boolean): Pick<AbilityDef, 'onSwitchIn' | 'onFieldChange' | 'speed'> => {
  const update = (ctx: Parameters<NonNullable<AbilityDef['onFieldChange']>>[0], self: Parameters<NonNullable<AbilityDef['onFieldChange']>>[1]) => {
    const on = active(ctx.battle);
    if (on && !self.boosted) {
      const stats = (['atk', 'def', 'spa', 'spd', 'spe'] as const).map((k) => [k, self.stats[k]] as const);
      self.boosted = stats.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
      abilityActivates(ctx, self, '¡Potencia su mejor estadística!');
    } else if (!on && self.boosted) {
      self.boosted = null;
      abilityActivates(ctx, self, 'Se acabó la potenciación.');
    }
  };
  return { onSwitchIn: update, onFieldChange: update, speed: (c) => (c.self.boosted === 'spe' ? 1.5 : 1) };
};

/** Mimético: cambia de tipo con el terreno. */
const MIMICRY: Record<Terrain, 'electric' | 'grass' | 'fairy' | 'psychic'> = { electric: 'electric', grassy: 'grass', misty: 'fairy', psychic: 'psychic' };

export const fieldDefs: Record<string, AbilityDef> = {
  // ---- Provocan clima ----
  drizzle: bringsWeather('rain'),
  drought: bringsWeather('sun'),
  'sand-stream': bringsWeather('sand'),
  'snow-warning': bringsWeather('snow'),
  'desolate-land': bringsWeather('harsh-sun'),
  'primordial-sea': bringsWeather('heavy-rain'),
  'delta-stream': bringsWeather('strong-winds'),
  'orichalcum-pulse': bringsWeather('sun'),
  'cloud-nine': { onSwitchIn: (ctx, self) => abilityActivates(ctx, self, 'El clima no tiene efecto.') },
  'air-lock': { onSwitchIn: (ctx, self) => abilityActivates(ctx, self, 'El clima no tiene efecto.') },
  'neutralizing-gas': { onSwitchIn: (ctx, self) => abilityActivates(ctx, self, '¡Las demás habilidades dejan de actuar!') },

  // ---- Provocan terreno ----
  'electric-surge': bringsTerrain('electric'),
  'grassy-surge': bringsTerrain('grassy'),
  'misty-surge': bringsTerrain('misty'),
  'psychic-surge': bringsTerrain('psychic'),
  'hadron-engine': bringsTerrain('electric'),

  // ---- Velocidad ----
  'swift-swim': speedIn((c) => rainy(c.weather)),
  chlorophyll: speedIn((c) => sunny(c.weather)),
  'sand-rush': { ...speedIn((c) => c.weather === 'sand'), weatherDamageImmune: true },
  'slush-rush': speedIn((c) => c.weather === 'snow'),
  'surge-surfer': speedIn((c) => c.terrain === 'electric'),
  'quick-feet': { speed: (c) => (c.self.status ? 1.5 : 1), ignoresParalysisSpeed: true },
  'slow-start': { speed: (c) => (c.self.slowStart > 0 ? 0.5 : 1) },
  protosynthesis: energy((b) => sunny(effectiveWeather(b))),
  'quark-drive': energy((b) => b.field.terrain === 'electric'),

  // ---- Precisión y evasión ----
  'sand-veil': { weatherDamageImmune: true, evasion: (c) => (effectiveWeather(c.battle) === 'sand' ? 0.8 : 1) },
  'snow-cloak': { weatherDamageImmune: true, evasion: (c) => (effectiveWeather(c.battle) === 'snow' ? 0.8 : 1) },
  'tangled-feet': { evasion: (c) => (c.target.confused > 0 ? 0.5 : 1) },
  'wonder-skin': { evasion: (c) => (c.move.category === 'status' && (c.move.accuracy ?? 0) > 50 ? 50 / c.move.accuracy! : 1) },
  'victory-star': { accuracy: () => 1.1 },

  // ---- Final de turno ----
  'rain-dish': { onEndTurn: (ctx, self) => { if (rainy(everyone(ctx))) { abilityActivates(ctx, self); healHp(ctx, self, Math.max(1, Math.floor(self.maxHp / 16))); } } },
  'ice-body': { onEndTurn: (ctx, self) => { if (everyone(ctx) === 'snow') { abilityActivates(ctx, self); healHp(ctx, self, Math.max(1, Math.floor(self.maxHp / 16))); } } },
  'dry-skin': {
    onEndTurn: (ctx, self) => {
      const w = everyone(ctx);
      if (rainy(w)) healHp(ctx, self, Math.max(1, Math.floor(self.maxHp / 8)));
      else if (sunny(w)) damageHp(ctx, self, Math.max(1, Math.floor(self.maxHp / 8)), 'ability');
    },
  },
  'solar-power': { onEndTurn: (ctx, self) => { if (sunny(everyone(ctx))) damageHp(ctx, self, Math.max(1, Math.floor(self.maxHp / 8)), 'ability'); } },
  hydration: { onEndTurn: (ctx, self) => { if (rainy(everyone(ctx)) && self.status) { abilityActivates(ctx, self, 'Se cura con la lluvia.'); cureStatus(ctx, self); } } },
  'poison-heal': { poisonHeal: true },
  moody: {
    onEndTurn: (ctx, self) => {
      const stats: StageKey[] = ['atk', 'def', 'spa', 'spd', 'spe'];
      const up = stats.filter((s) => self.stages[s] < 6);
      if (!up.length) return;
      const raised = ctx.rng.pick(up);
      const down = stats.filter((s) => s !== raised && self.stages[s] > -6);
      abilityActivates(ctx, self);
      changeStage(ctx, self, raised, 2, null);
      if (down.length) changeStage(ctx, self, ctx.rng.pick(down), -1, null);
    },
  },
  'bad-dreams': {
    onEndTurn: (ctx, self) => {
      const foe = foeOf(ctx, self);
      if (foe.hp > 0 && foe.status === 'sleep') {
        abilityActivates(ctx, self);
        damageHp(ctx, foe, Math.max(1, Math.floor(foe.maxHp / 8)), 'bad-dreams');
      }
    },
  },
  mimicry: {
    onSwitchIn: (ctx, self) => mimic(ctx, self),
    onFieldChange: (ctx, self) => mimic(ctx, self),
  },
  'magic-guard': { noIndirectDamage: true },
};

function mimic(ctx: Parameters<NonNullable<AbilityDef['onFieldChange']>>[0], self: Parameters<NonNullable<AbilityDef['onFieldChange']>>[1]): void {
  const terrain = ctx.battle.field.terrain;
  const target = terrain ? [MIMICRY[terrain]] : [...getSpecies(self.speciesId).types];
  if (target.length === self.types.length && target.every((t, i) => t === self.types[i])) return;
  if (terrain) abilityActivates(ctx, self);
  setTypes(ctx, self, target);
}

