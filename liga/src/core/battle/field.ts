import { abilitySlug, fieldHasAbility, runFieldChange } from './abilities';
import { emit, type Ctx } from './ops';
import { activeOf, type Battle, type Battler, type Side, type Terrain, type Weather } from './state';

export const WEATHER_TURNS = 5;
export const TERRAIN_TURNS = 5;
const STRONG: readonly Weather[] = ['harsh-sun', 'heavy-rain', 'strong-winds'];
export const isStrongWeather = (w: Weather | null): boolean => w !== null && STRONG.includes(w);

/** Clima que se nota en combate: se anula con Aire Cerrado o Nubosidad en el campo. */
export function effectiveWeather(battle: Battle): Weather | null {
  if (!battle.field.weather) return null;
  return fieldHasAbility(battle, ['cloud-nine', 'air-lock']) ? null : battle.field.weather;
}

export const effectiveTerrain = (battle: Battle): Terrain | null => battle.field.terrain;

/** Tierra firme: no es Volador, no flota y no está bajo los efectos que lo elevan. Los terrenos solo afectan a quien pisa el suelo. */
export function isGrounded(b: Battler): boolean {
  if (b.types.includes('flying')) return false;
  const slug = abilitySlug(b);
  return !(!b.suppressed && (slug === 'levitate' || slug === 'eelevate'));
}

/** El clima que debe aplicarse al ataque de `user`: Megasolar lo trata siempre como sol. */
export function weatherFor(battle: Battle, user: Battler): Weather | null {
  if (!user.suppressed && abilitySlug(user) === 'mega-sol') return 'sun';
  return effectiveWeather(battle);
}

/**
 * Provoca un clima. Un clima normal no sustituye a uno fuerte; uno fuerte sí sustituye a cualquiera.
 * Devuelve false si no cambia nada.
 */
export function setWeather(ctx: Ctx, weather: Weather, source: Side | null): boolean {
  const f = ctx.battle.field;
  if (f.weather === weather) return false;
  if (isStrongWeather(f.weather) && !isStrongWeather(weather)) return false;
  const was = f.weather;
  f.weather = weather;
  f.weatherTurns = isStrongWeather(weather) ? 0 : WEATHER_TURNS;
  f.weatherSource = isStrongWeather(weather) ? source : null;
  emit(ctx, { type: 'weather', weather, was });
  runFieldChange(ctx);
  return true;
}

export function clearWeather(ctx: Ctx): void {
  const f = ctx.battle.field;
  if (!f.weather) return;
  const was = f.weather;
  f.weather = null;
  f.weatherTurns = 0;
  f.weatherSource = null;
  emit(ctx, { type: 'weather', weather: null, was });
  runFieldChange(ctx);
}

export function setTerrain(ctx: Ctx, terrain: Terrain): boolean {
  const f = ctx.battle.field;
  if (f.terrain === terrain) return false;
  const was = f.terrain;
  f.terrain = terrain;
  f.terrainTurns = TERRAIN_TURNS;
  emit(ctx, { type: 'terrain', terrain, was });
  runFieldChange(ctx);
  return true;
}

export function clearTerrain(ctx: Ctx): void {
  const f = ctx.battle.field;
  if (!f.terrain) return;
  const was = f.terrain;
  f.terrain = null;
  f.terrainTurns = 0;
  emit(ctx, { type: 'terrain', terrain: null, was });
  runFieldChange(ctx);
}

/**
 * Un clima fuerte dura mientras el Pokémon que lo provocó siga en el campo con esa habilidad.
 * Se llama al retirarse o debilitarse un Pokémon.
 */
export function checkStrongWeather(ctx: Ctx): void {
  const f = ctx.battle.field;
  if (!isStrongWeather(f.weather) || f.weatherSource === null) return;
  const holder = activeOf(ctx.battle, f.weatherSource);
  const slug = abilitySlug(holder);
  const needed = f.weather === 'harsh-sun' ? 'desolate-land' : f.weather === 'heavy-rain' ? 'primordial-sea' : 'delta-stream';
  if (holder.hp > 0 && !holder.suppressed && slug === needed) return;
  // otro Pokémon en el campo con la misma habilidad lo mantiene
  for (const side of [0, 1] as const) {
    const b = activeOf(ctx.battle, side);
    if (b.hp > 0 && !b.suppressed && abilitySlug(b) === needed) {
      f.weatherSource = side;
      return;
    }
  }
  clearWeather(ctx);
}
