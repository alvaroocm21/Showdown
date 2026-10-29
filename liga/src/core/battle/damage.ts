import type { Move } from '../types';
import { damageMods, ignoresBurnPenalty, ignoresStages, hitsGhost } from './abilities';
import { effectiveTerrain, isGrounded, weatherFor } from './field';
import { applyStage } from './stages';
import { STRUGGLE_ID, type Battle, type Battler } from './state';
import { typeEffectiveness } from './typeEffect';

export const CRIT_MULTIPLIER = 1.5;
/** Probabilidad de crítico según el nivel de crítico del ataque (0, +1, +2, +3 o más). */
export const CRIT_CHANCE = [1 / 16, 1 / 8, 1 / 2, 1] as const;
export const critChance = (critStage: number) => CRIT_CHANCE[Math.max(0, Math.min(3, critStage))]!;

export interface DamageInput {
  level: number;
  power: number;
  attack: number;
  defense: number;
  /** true = ×1,5; un número es el multiplicador (p. ej. 2 con Adaptable); false = sin bonificación. */
  stab: boolean | number;
  effectiveness: number;
  crit: boolean;
  /** Multiplicador del crítico (×1,5; ×2,25 con Francotirador). */
  critMultiplier?: number;
  /** Variación aleatoria, entero entre 85 y 100. */
  roll: number;
  burned?: boolean;
  physical?: boolean;
  /** Clima: se aplica antes del crítico. */
  weatherMultiplier?: number;
  /** Multiplicador final (habilidades como Multiescamas). */
  finalMultiplier?: number;
}

/** Fórmula de daño de 5.ª generación en adelante (cada paso se redondea hacia abajo). */
export function calcDamage(i: DamageInput): number {
  if (i.effectiveness === 0) return 0;
  let d = Math.floor(Math.floor(((Math.floor((2 * i.level) / 5) + 2) * i.power * i.attack) / i.defense) / 50) + 2;
  if (i.weatherMultiplier && i.weatherMultiplier !== 1) d = Math.floor(d * i.weatherMultiplier);
  if (i.crit) d = Math.floor(d * (i.critMultiplier ?? CRIT_MULTIPLIER));
  d = Math.floor((d * i.roll) / 100);
  if (i.stab) d = Math.floor(d * (i.stab === true ? 1.5 : i.stab));
  d = Math.floor(d * i.effectiveness);
  if (i.burned && i.physical) d = Math.floor(d / 2);
  if (i.finalMultiplier && i.finalMultiplier !== 1) d = Math.floor(d * i.finalMultiplier);
  return Math.max(1, d);
}

/** Ataques cuya potencia baja a la mitad con lluvia, arena o nieve. */
const HALVED_IN_BAD_WEATHER = new Set(['solar-beam', 'solar-blade']);
/** Ataques que la hierba del terreno debilita contra quien pisa el suelo. */
const GRASSY_HALVED = new Set(['earthquake', 'bulldoze', 'magnitude']);

export interface DamageOptions {
  battle: Battle;
  crit: boolean;
  roll: number;
  /** Potencia calculada (ataques de potencia variable). */
  power?: number;
  /** Multiplicador de potencia por cambio de tipo (-ate: ×1,2). */
  powerBoost?: number;
  /** Número de golpe dentro de un ataque multigolpe. */
  hitIndex?: number;
  /** El usuario actúa después que el objetivo en este turno. */
  movesLast?: boolean;
  /** Multiplicador final extra (segundo golpe de Amor Filial). */
  extraFinal?: number;
}

/** Multiplicador de tipos del ataque de `user` contra `target` con el clima actual. */
export function effectivenessOf(battle: Battle, user: Battler, target: Battler, move: Move): number {
  if (move.id === STRUGGLE_ID) return 1;
  return typeEffectiveness(move.type, target.types, {
    hitsGhost: hitsGhost(user),
    strongWinds: battle.field.weather === 'strong-winds',
  });
}

/**
 * Daño de un ataque entre dos Pokémon en combate: mejoras de estadísticas, quemadura, habilidades, clima y terreno.
 * `move` ya debe llevar el tipo definitivo (tras Piel Celeste, Bola Clima, etc.).
 */
export function computeMoveDamage(user: Battler, target: Battler, move: Move, opts: DamageOptions): number {
  const { battle } = opts;
  const physical = move.category === 'physical';
  const atkKey = physical ? 'atk' : 'spa';
  const defKey = physical ? 'def' : 'spd';
  const struggle = move.id === STRUGGLE_ID;
  const effectiveness = effectivenessOf(battle, user, target, move);
  const weather = weatherFor(battle, user);
  const terrain = effectiveTerrain(battle);

  const m = damageMods({
    battle, user, target, move, effectiveness, crit: opts.crit, physical, weather, terrain,
    movesLast: opts.movesLast ?? false, hitIndex: opts.hitIndex ?? 0,
  });

  // En un crítico se ignoran las bajadas del atacante y las subidas del defensor. Despiste ignora las mejoras del rival.
  let atkStage = opts.crit ? Math.max(0, user.stages[atkKey]) : user.stages[atkKey];
  let defStage = opts.crit ? Math.min(0, target.stages[defKey]) : target.stages[defKey];
  if (ignoresStages(target)) atkStage = 0;
  if (ignoresStages(user)) defStage = 0;

  // Potencia: habilidades, terreno y clima
  let powerMult = m.power * (opts.powerBoost ?? 1);
  if (!struggle) {
    if (user.charged && move.type === 'electric') powerMult *= 2; // Dinamo / Energía Eólica / Carga
    if (isGrounded(user)) {
      if (terrain === 'electric' && move.type === 'electric') powerMult *= 1.3;
      else if (terrain === 'grassy' && move.type === 'grass') powerMult *= 1.3;
      else if (terrain === 'psychic' && move.type === 'psychic') powerMult *= 1.3;
    }
    if (isGrounded(target)) {
      if (terrain === 'misty' && move.type === 'dragon') powerMult *= 0.5;
      if (terrain === 'grassy' && GRASSY_HALVED.has(move.slug)) powerMult *= 0.5;
    }
    if (HALVED_IN_BAD_WEATHER.has(move.slug) && (weather === 'rain' || weather === 'heavy-rain' || weather === 'sand' || weather === 'snow')) powerMult *= 0.5;
  }

  // Estadísticas del defensor con el clima (arena: Roca +50 % Def. Esp.; nieve: Hielo +50 % Defensa)
  let defMult = m.def;
  if (weather === 'sand' && !physical && target.types.includes('rock')) defMult *= 1.5;
  if (weather === 'snow' && physical && target.types.includes('ice')) defMult *= 1.5;

  // Clima sobre el daño (Fuego/Agua)
  let weatherMultiplier = 1;
  if (weather === 'sun' || weather === 'harsh-sun') weatherMultiplier = move.type === 'fire' ? 1.5 : move.type === 'water' ? 0.5 : 1;
  else if (weather === 'rain' || weather === 'heavy-rain') weatherMultiplier = move.type === 'water' ? 1.5 : move.type === 'fire' ? 0.5 : 1;
  if (struggle) weatherMultiplier = 1;

  return calcDamage({
    level: user.level,
    power: Math.max(1, Math.floor((opts.power ?? move.power ?? 0) * powerMult)),
    attack: Math.floor(applyStage(user.stats[atkKey], atkStage) * m.atk),
    defense: Math.max(1, Math.floor(applyStage(target.stats[defKey], defStage) * defMult)),
    stab: !struggle && user.types.includes(move.type) ? m.stab : false,
    effectiveness,
    crit: opts.crit,
    critMultiplier: m.crit,
    roll: opts.roll,
    burned: user.status === 'burn' && !ignoresBurnPenalty(user),
    physical,
    weatherMultiplier,
    finalMultiplier: m.final * (opts.extraFinal ?? 1),
  });
}
