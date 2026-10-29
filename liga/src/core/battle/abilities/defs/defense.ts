import { getAbility } from '../../../data';
import type { PokeType, StageKey } from '../../../types';
import { setTerrain, setWeather } from '../../field';
import { WIND_MOVES } from '../../moves';
import { abilityActivates, changeAbility, changeStage, damageHp, healHp, inflictStatus, statusBlock } from '../../ops';
import { activeOf, type Battler } from '../../state';
import type { AbilityDef } from '../types';

/** Inmunidades y absorciones, protección contra estados y bajadas, y reacciones al recibir golpes. */

const selfTarget = (target: number) => target === 5 || target === 7 || target === 13;
const crossedHalf = (self: Battler, amount: number) => self.hp > 0 && (self.hp + amount) * 2 > self.maxHp && self.hp * 2 <= self.maxHp;
const raise = (stat: StageKey, n: number) => (ctx: Parameters<NonNullable<AbilityDef['onDamaged']>>[0], self: Battler) => {
  if (self.hp > 0) {
    abilityActivates(ctx, self);
    changeStage(ctx, self, stat, n, null);
  }
};

/** Absorbe un tipo de ataque y sube una estadística. */
const absorbStat = (type: PokeType, stat: StageKey, n: number): AbilityDef => ({
  immune: (c) => c.move.type === type,
  onImmune: (ctx, _user, self) => {
    abilityActivates(ctx, self, 'Absorbe el ataque.');
    changeStage(ctx, self, stat, n, null);
  },
});
const absorbHeal = (when: AbilityDef['immune']): AbilityDef => ({
  immune: when,
  onImmune: (ctx, _user, self) => {
    abilityActivates(ctx, self, 'Absorbe el ataque.');
    healHp(ctx, self, Math.max(1, Math.floor(self.maxHp / 4)));
  },
});
const immuneToIntimidate: AbilityDef['intimidateReaction'] = (ctx, self) => {
  abilityActivates(ctx, self, 'Es inmune a Intimidación.');
  return 'immune';
};
const statusProof = (...statuses: string[]): AbilityDef => ({ blocksStatus: (_s, status) => statuses.includes(status) });
const prioritySafe: AbilityDef = { immune: (c) => c.priority > 0 && !selfTarget(c.move.target), onImmune: (ctx, _u, self) => abilityActivates(ctx, self, 'Impide los ataques con prioridad.') };

export const defenseDefs: Record<string, AbilityDef> = {
  // ---- Inmunidad a ataques ----
  'motor-drive': absorbStat('electric', 'spe', 1),
  'sap-sipper': absorbStat('grass', 'atk', 1),
  'storm-drain': absorbStat('water', 'spa', 1),
  'well-baked-body': absorbStat('fire', 'def', 2),
  'wind-rider': { immune: (c) => WIND_MOVES.has(c.move.slug), onImmune: (ctx, _u, self) => { abilityActivates(ctx, self, 'Absorbe el viento.'); changeStage(ctx, self, 'atk', 1, null); } },
  'dry-skin': absorbHeal((c) => c.move.type === 'water'),
  'earth-eater': absorbHeal((c) => c.move.type === 'ground'),
  bulletproof: { immune: (c) => c.move.flags.ballistics },
  overcoat: { weatherDamageImmune: true, immune: (c) => c.move.flags.powder },
  'good-as-gold': { immune: (c) => c.move.category === 'status' && !selfTarget(c.move.target) },
  'queenly-majesty': prioritySafe,
  dazzling: prioritySafe,
  'armor-tail': prioritySafe,
  eelevate: { immune: (c) => c.move.category !== 'status' && c.move.type === 'ground' },
  'magic-bounce': { reflectsStatus: true },
  disguise: {
    absorbHit: (ctx, _user, self) => {
      if (self.disguiseBroken) return false;
      self.disguiseBroken = true;
      abilityActivates(ctx, self, '¡Su disfraz lo protegió!');
      damageHp(ctx, self, Math.max(1, Math.floor(self.maxHp / 8)), 'disguise');
      return true;
    },
  },
  'ice-face': {
    absorbHit: (ctx, _user, self, move) => {
      if (self.iceFaceBroken || move.category !== 'physical') return false;
      self.iceFaceBroken = true;
      abilityActivates(ctx, self, '¡Su cara de hielo lo protegió!');
      return true;
    },
    onFieldChange: (ctx, self) => {
      if (self.iceFaceBroken && ctx.battle.field.weather === 'snow') {
        self.iceFaceBroken = false;
        abilityActivates(ctx, self, 'Recupera su cara de hielo.');
      }
    },
  },

  // ---- Estados y bajadas de estadísticas ----
  'own-tempo': { blocksConfusion: true, intimidateReaction: immuneToIntimidate },
  oblivious: { intimidateReaction: immuneToIntimidate },
  scrappy: { hitsGhost: true, intimidateReaction: immuneToIntimidate },
  'minds-eye': { hitsGhost: true, blocksStatDrop: (s) => s === 'acc' },
  'sweet-veil': statusProof('sleep'),
  'pastel-veil': statusProof('poison', 'toxic'),
  'leaf-guard': { blocksStatus: (_s, _st, _b, weather) => weather === 'sun' || weather === 'harsh-sun' },
  'purifying-salt': { blocksStatus: () => true },
  comatose: { blocksStatus: () => true },
  'thermal-exchange': {
    ...statusProof('burn'),
    onDamaged: (ctx, self, _a, move) => {
      if (move.type === 'fire') raise('atk', 1)(ctx, self);
    },
  },
  'big-pecks': { blocksStatDrop: (s) => s === 'def' },
  'full-metal-body': { blocksStatDrop: () => true },
  'mirror-armor': { reflectsStatDrops: true },
  contrary: { stageDelta: (d) => -d },
  simple: { stageDelta: (d) => d * 2 },
  'suction-cups': { anchor: true },
  'guard-dog': {
    anchor: true,
    intimidateReaction: (ctx, self) => {
      abilityActivates(ctx, self, 'Se enfurece con la Intimidación.');
      changeStage(ctx, self, 'atk', 1, null);
      return 'handled';
    },
  },

  // ---- Reacciones a las estadísticas ----
  defiant: { onStatDropped: (ctx, self) => { abilityActivates(ctx, self); changeStage(ctx, self, 'atk', 2, null); } },
  competitive: { onStatDropped: (ctx, self) => { abilityActivates(ctx, self); changeStage(ctx, self, 'spa', 2, null); } },
  opportunist: {
    onFoeStatRaised: (ctx, self, _foe, stat, delta) => {
      abilityActivates(ctx, self, 'Aprovecha la ocasión.');
      changeStage(ctx, self, stat, delta, null, { react: false });
    },
  },
  steadfast: { onFlinched: (ctx, self) => { abilityActivates(ctx, self); changeStage(ctx, self, 'spe', 1, null); } },

  // ---- Al recibir un golpe ----
  'anger-point': { onDamaged: (ctx, self, _a, _m, _amt, crit) => { if (crit && self.hp > 0) { abilityActivates(ctx, self, '¡Se enfurece!'); changeStage(ctx, self, 'atk', 12, null); } } },
  rattled: {
    onDamaged: (ctx, self, _a, move) => { if (['bug', 'ghost', 'dark'].includes(move.type)) raise('spe', 1)(ctx, self); },
    intimidateReaction: (ctx, self) => { abilityActivates(ctx, self, 'Se asusta.'); changeStage(ctx, self, 'spe', 1, null); return 'handled'; },
  },
  justified: { onDamaged: (ctx, self, _a, move) => { if (move.type === 'dark') raise('atk', 1)(ctx, self); } },
  'weak-armor': {
    onDamaged: (ctx, self, _a, move) => {
      if (move.category !== 'physical' || self.hp <= 0) return;
      abilityActivates(ctx, self);
      changeStage(ctx, self, 'def', -1, null);
      changeStage(ctx, self, 'spe', 2, null);
    },
  },
  stamina: { onDamaged: (ctx, self) => raise('def', 1)(ctx, self) },
  'water-compaction': { onDamaged: (ctx, self, _a, move) => { if (move.type === 'water') raise('def', 2)(ctx, self); } },
  'steam-engine': { onDamaged: (ctx, self, _a, move) => { if (move.type === 'fire' || move.type === 'water') raise('spe', 12)(ctx, self); } },
  berserk: { onDamaged: (ctx, self, _a, _m, amount) => { if (crossedHalf(self, amount)) raise('spa', 1)(ctx, self); } },
  'anger-shell': {
    onDamaged: (ctx, self, _a, _m, amount) => {
      if (!crossedHalf(self, amount)) return;
      abilityActivates(ctx, self, '¡Se enfurece!');
      for (const [stat, n] of [['atk', 1], ['spa', 1], ['spe', 1], ['def', -1], ['spd', -1]] as const) changeStage(ctx, self, stat, n, null);
    },
  },
  'cotton-down': { onDamaged: (ctx, self, attacker) => { if (attacker.hp > 0) { abilityActivates(ctx, self, 'Esparce algodón.'); changeStage(ctx, attacker, 'spe', -1, self); } } },
  electromorphosis: { onDamaged: (ctx, self) => { if (self.hp > 0) { self.charged = true; abilityActivates(ctx, self, '¡Se carga de electricidad!'); } } },
  'wind-power': { onDamaged: (ctx, self, _a, move) => { if (self.hp > 0 && WIND_MOVES.has(move.slug)) { self.charged = true; abilityActivates(ctx, self, '¡Se carga de electricidad!'); } } },
  'seed-sower': { onDamaged: (ctx, self) => { if (self.hp > 0 && ctx.battle.field.terrain !== 'grassy') { abilityActivates(ctx, self); setTerrain(ctx, 'grassy'); } } },
  'sand-spit': { onDamaged: (ctx, self) => { if (self.hp > 0 && ctx.battle.field.weather !== 'sand') { abilityActivates(ctx, self); setWeather(ctx, 'sand', null); } } },
  'cursed-body': {
    onDamaged: (ctx, self, attacker, move) => {
      if (self.hp <= 0 || attacker.hp <= 0 || attacker.disabled || ctx.rng.int(1, 100) > 30) return;
      if (!attacker.moves.some((m) => m.moveId === move.id)) return;
      abilityActivates(ctx, self, 'Anula su ataque.');
      attacker.disabled = { moveId: move.id, turns: 4 };
      ctx.events.push({ type: 'volatile', side: activeOf(ctx.battle, 0) === attacker ? 0 : 1, pokemon: attacker.name, kind: 'disable', on: true });
    },
  },
  'wimp-out': { onDamaged: (ctx, self, _a, _m, amount) => { if (crossedHalf(self, amount)) { abilityActivates(ctx, self, '¡Se retira!'); self.forceOut = true; } } },
  'emergency-exit': { onDamaged: (ctx, self, _a, _m, amount) => { if (crossedHalf(self, amount)) { abilityActivates(ctx, self, '¡Sale en una emergencia!'); self.forceOut = true; } } },
  'spicy-spray': {
    onDamaged: (ctx, self, attacker) => {
      if (self.hp <= 0 || attacker.hp <= 0 || statusBlock(attacker, 'burn', ctx.battle, self)) return;
      abilityActivates(ctx, self);
      inflictStatus(ctx, attacker, 'burn', self, false);
    },
  },

  // ---- Al contacto ----
  'iron-barbs': {
    onContact: (ctx, self, attacker) => {
      if (attacker.hp <= 0) return;
      abilityActivates(ctx, self);
      damageHp(ctx, attacker, Math.max(1, Math.floor(attacker.maxHp / 8)), 'rough-skin');
    },
  },
  gooey: { onContact: (ctx, self, attacker) => { if (attacker.hp > 0) { abilityActivates(ctx, self); changeStage(ctx, attacker, 'spe', -1, self); } } },
  'tangling-hair': { onContact: (ctx, self, attacker) => { if (attacker.hp > 0) { abilityActivates(ctx, self); changeStage(ctx, attacker, 'spe', -1, self); } } },
  mummy: { onContact: (ctx, self, attacker) => spreadAbility(ctx, self, attacker, self.abilityId) },
  'lingering-aroma': { onContact: (ctx, self, attacker) => spreadAbility(ctx, self, attacker, self.abilityId) },
  'wandering-spirit': {
    onContact: (ctx, self, attacker) => {
      if (attacker.hp <= 0 || attacker.abilityId === self.abilityId || UNCHANGEABLE.has(getAbility(attacker.abilityId).slug)) return;
      const mine = self.abilityId;
      abilityActivates(ctx, self, 'Intercambia habilidades.');
      changeAbility(ctx, self, attacker.abilityId);
      changeAbility(ctx, attacker, mine);
    },
  },
  'perish-body': {
    onContact: (ctx, self, attacker) => {
      if (self.hp <= 0 || attacker.hp <= 0 || self.perish > 0 || attacker.perish > 0) return;
      abilityActivates(ctx, self, '¡Los dos se debilitarán en 3 turnos!');
      self.perish = 4;
      attacker.perish = 4;
    },
  },
  'poison-touch': {
    onDealtDamage: (ctx, self, target, move) => {
      if (!move.flags.contact || target.hp <= 0 || ctx.rng.int(1, 100) > 30 || statusBlock(target, 'poison', ctx.battle, self)) return;
      abilityActivates(ctx, self);
      inflictStatus(ctx, target, 'poison', self, false);
    },
  },
  'toxic-chain': {
    onDealtDamage: (ctx, self, target) => {
      if (target.hp <= 0 || ctx.rng.int(1, 100) > 30 || statusBlock(target, 'toxic', ctx.battle, self)) return;
      abilityActivates(ctx, self);
      inflictStatus(ctx, target, 'toxic', self, false);
    },
  },

  // ---- Al debilitarse o debilitar ----
  aftermath: {
    onFainted: (ctx, self, attacker, move) => {
      if (!move?.flags.contact || attacker.hp <= 0) return;
      abilityActivates(ctx, self, 'Daña a quien lo debilitó.');
      damageHp(ctx, attacker, Math.max(1, Math.floor(attacker.maxHp / 4)), 'ability');
    },
  },
  'innards-out': {
    onFainted: (ctx, self, attacker, _m, amount) => {
      if (attacker.hp <= 0) return;
      abilityActivates(ctx, self, 'Devuelve el daño.');
      damageHp(ctx, attacker, amount, 'ability');
    },
  },
  moxie: { onKnockOut: (ctx, self) => raise('atk', 1)(ctx, self) },
  'chilling-neigh': { onKnockOut: (ctx, self) => raise('atk', 1)(ctx, self) },
  'grim-neigh': { onKnockOut: (ctx, self) => raise('spa', 1)(ctx, self) },
  'as-one-glastrier': { onKnockOut: (ctx, self) => raise('atk', 1)(ctx, self) },
  'as-one-spectrier': { onKnockOut: (ctx, self) => raise('spa', 1)(ctx, self) },
  'beast-boost': {
    onKnockOut: (ctx, self) => {
      const stats = (['atk', 'def', 'spa', 'spd', 'spe'] as const).map((k) => [k, self.stats[k]] as const);
      const best = stats.reduce((a, b) => (b[1] > a[1] ? b : a));
      raise(best[0], 1)(ctx, self);
    },
  },
  'soul-heart': { onAnyFainted: (ctx, self) => raise('spa', 1)(ctx, self) },
};

/** Habilidades que no se pueden cambiar ni copiar. */
export const UNCHANGEABLE: ReadonlySet<string> = new Set(['multitype', 'stance-change', 'schooling', 'battle-bond', 'power-construct', 'shields-down', 'rks-system', 'zen-mode', 'disguise', 'comatose', 'gulp-missile', 'ice-face', 'hunger-switch', 'zero-to-hero', 'commander', 'as-one-glastrier', 'as-one-spectrier', 'neutralizing-gas', 'wonder-guard']);

function spreadAbility(ctx: Parameters<NonNullable<AbilityDef['onContact']>>[0], self: Battler, attacker: Battler, abilityId: number): void {
  if (attacker.hp <= 0 || attacker.abilityId === abilityId || UNCHANGEABLE.has(getAbility(attacker.abilityId).slug)) return;
  abilityActivates(ctx, self, 'Contagia su habilidad.');
  changeAbility(ctx, attacker, abilityId);
}
