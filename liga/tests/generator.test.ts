import { describe, expect, it } from 'vitest';
import { ABILITIES, getMove, getSpecies } from '../src/core/data';
import { isDirectDamage, isPlayableMoveset, rollMoves, rollTeam, speciesPool } from '../src/core/generator';
import { createRng } from '../src/core/rng';

describe('rng', () => {
  it('es reproducible con la misma semilla', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });
  it('int respeta los límites', () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) expect(r.int(3, 5)).toBeGreaterThanOrEqual(3);
  });
});

describe('generador de equipos', () => {
  it('solo sortea Pokémon en su última etapa, sin legendarios, de las 3 primeras generaciones', () => {
    for (const s of speciesPool()) {
      expect(s.finalStage).toBe(true);
      expect(s.legendary).toBe(false);
      expect(s.generation).toBeLessThanOrEqual(3);
    }
    expect(speciesPool({ allowLegendary: true }).length).toBeGreaterThan(speciesPool().length);
  });

  it('genera equipos válidos para muchas semillas', () => {
    const abilityIds = new Set(ABILITIES.map((a) => a.id));
    for (let seed = 1; seed <= 300; seed++) {
      const team = rollTeam(createRng(seed));
      expect(team).toHaveLength(6);
      expect(new Set(team.map((p) => p.speciesId)).size).toBe(6);
      for (const p of team) {
        const species = getSpecies(p.speciesId);
        expect(p.moveIds).toHaveLength(4);
        expect(new Set(p.moveIds).size).toBe(4);
        expect(abilityIds.has(p.abilityId)).toBe(true);
        const damaging = p.moveIds.map(getMove).filter(isDirectDamage);
        expect(damaging.length).toBeGreaterThanOrEqual(2);
        // Clefable y Granbull (Hada puro) no tienen ataques de daño de su tipo en gen 1-3.
        if (!['clefable', 'granbull'].includes(species.slug)) {
          expect(damaging.some((m) => species.types.includes(m.type))).toBe(true);
        }
        expect(isPlayableMoveset(species, p.moveIds)).toBe(true);
      }
    }
  });

  it('es determinista con la misma semilla', () => {
    expect(rollTeam(createRng(7))).toEqual(rollTeam(createRng(7)));
    expect(rollTeam(createRng(7))).not.toEqual(rollTeam(createRng(8)));
  });

  it('la habilidad puede no ser propia de la especie (sale de todo el pool)', () => {
    const abilities = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) for (const p of rollTeam(createRng(seed))) abilities.add(p.abilityId);
    expect(abilities.size).toBeGreaterThan(60);
  });

  it('rollMoves siempre cumple las reglas aunque la especie sea de tipo raro', () => {
    const rng = createRng(99);
    for (const s of speciesPool({ allowLegendary: true })) {
      expect(isPlayableMoveset(s, rollMoves(s, rng))).toBe(true);
    }
  });

  it('rechaza sets injugables', () => {
    const charizard = getSpecies(6);
    const status = [] as number[];
    expect(isPlayableMoveset(charizard, status)).toBe(false);
  });
});
