import { SPECIES, isMega } from '../data';
import { speciesPool, TEAM_SIZE, type GenerateOptions } from '../generator';
import { ALL_GENERATIONS, type DrawSettings, type GameState } from './types';

/** Región de cada generación (para mostrarlo en la interfaz). */
export const GENERATION_NAMES: Record<number, string> = {
  1: 'Kanto', 2: 'Johto', 3: 'Hoenn', 4: 'Sinnoh', 5: 'Teselia', 6: 'Kalos', 7: 'Alola', 8: 'Galar', 9: 'Paldea',
};

/** Hacen falta Pokémon de sobra para formar un equipo y poder sustituir (equipo + alternativas). */
export const MIN_POOL = TEAM_SIZE * 2;

export const drawOptions = (draw: DrawSettings): GenerateOptions => ({
  generations: draw.generations,
  allowLegendary: draw.legendaries,
  finalStageOnly: draw.finalStageOnly,
});

/** Opciones de sorteo de la partida actual. */
export const drawOptionsOf = (state: GameState): GenerateOptions => drawOptions(state.settings.draw);

/** Cuántos Pokémon distintos pueden salir con esos ajustes. */
export const poolSize = (draw: DrawSettings): number => speciesPool(drawOptions(draw)).length;

/** Error de validación de los ajustes (null si son válidos). */
export function validateDraw(draw: DrawSettings): string | null {
  if (!draw.generations.length) return 'Elige al menos una generación';
  if (new Set(draw.generations).size !== draw.generations.length) return 'Generaciones repetidas';
  if (draw.generations.some((g) => !(ALL_GENERATIONS as readonly number[]).includes(g))) return 'Generación desconocida';
  if (poolSize(draw) < MIN_POOL) return `Con esos ajustes hay muy pocos Pokémon (mínimo ${MIN_POOL})`;
  return null;
}

/** Cuántos Pokémon sorteables hay en cada generación (sin filtrar; las megas no cuentan: solo existen en combate). */
export const speciesPerGeneration = (): Record<number, number> => {
  const out: Record<number, number> = {};
  for (const s of SPECIES) if (!isMega(s)) out[s.generation] = (out[s.generation] ?? 0) + 1;
  return out;
};

/** Total de Pokémon que se pueden sortear con todo abierto. */
export const totalDrawable = (): number => SPECIES.filter((s) => !isMega(s)).length;
