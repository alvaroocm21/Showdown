import { describe, expect, it } from 'vitest';
import { ABILITIES, MOVES, NATURES, SPECIES, TYPE_CHART, getNature, getSpecies } from '../src/core/data';
import { computeStats, DEFAULT_BUILD } from '../src/core/stats';
import { TYPE_NAMES } from '../src/core/types';

describe('datos descargados', () => {
  it('contiene las 3 primeras generaciones', () => {
    expect(SPECIES).toHaveLength(386);
    expect(Math.max(...SPECIES.map((s) => s.id))).toBe(386);
    expect(ABILITIES).toHaveLength(76);
    expect(MOVES.length).toBeGreaterThan(300);
  });

  it('tiene nombres en español', () => {
    expect(getSpecies(25).name).toBe('Pikachu');
    expect(MOVES.find((m) => m.slug === 'flamethrower')?.name).toBe('Lanzallamas');
    expect(ABILITIES.find((a) => a.slug === 'intimidate')?.name).toBe('Intimidación');
  });

  it('la tabla de tipos cubre los 18 tipos', () => {
    for (const a of TYPE_NAMES) for (const d of TYPE_NAMES) expect(TYPE_CHART[a][d]).toBeTypeOf('number');
    expect(TYPE_CHART.fire.grass).toBe(2);
    expect(TYPE_CHART.water.fire).toBe(2);
    expect(TYPE_CHART.normal.ghost).toBe(0);
    expect(TYPE_CHART.electric.ground).toBe(0);
    expect(TYPE_CHART.dragon.fairy).toBe(0);
    expect(TYPE_CHART.fire.water).toBe(0.5);
  });

  it('la naturaleza por defecto es neutra', () => {
    const n = getNature(DEFAULT_BUILD.natureId);
    expect(n.up).toBeNull();
    expect(n.slug).toBe('serious');
  });
});

describe('estadísticas', () => {
  it('Charizard nivel 50, IV 31, EV 0, naturaleza neutra', () => {
    expect(computeStats(6, DEFAULT_BUILD)).toEqual({ hp: 153, atk: 104, def: 98, spa: 129, spd: 105, spe: 120 });
  });

  it('la naturaleza sube un 10 % y baja otro 10 %', () => {
    const nature = NATURES.find((n) => n.slug === 'adamant')!;
    const adamant = { ...DEFAULT_BUILD, natureId: nature.id };
    expect(nature.up).toBe('atk');
    expect(nature.down).toBe('spa');
    const base = computeStats(6, DEFAULT_BUILD);
    const adj = computeStats(6, adamant);
    expect(adj.atk).toBe(Math.floor(base.atk * 1.1));
    expect(adj.spa).toBe(Math.floor(base.spa * 0.9));
    expect(adj.hp).toBe(base.hp);
  });

  it('los EVs suman 1 punto cada 4', () => {
    const evs = { ...DEFAULT_BUILD, evs: { ...DEFAULT_BUILD.evs, hp: 252 } };
    expect(computeStats(6, evs).hp).toBe(185);
  });
});
