import { getNature, getSpecies } from './data';
import type { BuildConfig, Stats, StatKey } from './types';
import { STAT_KEYS } from './types';

const zeros = (): Stats => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
const all = (v: number): Stats => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });

/** Naturaleza Seria (neutra), IV 31 y EV 0 salvo que el jugador lo cambie. */
export const SERIOUS_NATURE_ID = 25;

export const DEFAULT_BUILD: BuildConfig = {
  level: 50,
  ivs: all(31),
  evs: zeros(),
  natureId: SERIOUS_NATURE_ID,
};

export const cloneBuild = (b: BuildConfig): BuildConfig => ({
  level: b.level,
  ivs: { ...b.ivs },
  evs: { ...b.evs },
  natureId: b.natureId,
});

/** Estadísticas reales (fórmula de 3.ª generación en adelante). */
export function computeStats(speciesId: number, build: BuildConfig): Stats {
  const { baseStats } = getSpecies(speciesId);
  const nature = getNature(build.natureId);
  const out = zeros();
  for (const key of STAT_KEYS) {
    const core = Math.floor(((2 * baseStats[key] + build.ivs[key] + Math.floor(build.evs[key] / 4)) * build.level) / 100);
    if (key === 'hp') {
      out.hp = core + build.level + 10;
    } else {
      const mult = nature.up === key ? 1.1 : nature.down === key ? 0.9 : 1;
      out[key as StatKey] = Math.floor((core + 5) * mult);
    }
  }
  return out;
}
