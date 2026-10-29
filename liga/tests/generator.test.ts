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
  it('por defecto solo sortea Pokémon en su última etapa y sin legendarios, de todas las generaciones', () => {
    const pool = speciesPool();
    for (const s of pool) {
      expect(s.finalStage).toBe(true);
      expect(s.legendary).toBe(false);
    }
    expect(new Set(pool.map((s) => s.generation))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it('las formas regionales se sortean y las megas nunca', () => {
    const all = speciesPool({ finalStageOnly: false, allowLegendary: true });
    expect(all.some((s) => s.slug === 'raichu-alola')).toBe(true);
    expect(all.some((s) => s.form?.kind === 'mega')).toBe(false);
    const pool = speciesPool();
    expect(pool.some((s) => s.slug === 'ninetales-alola')).toBe(true); // última etapa
    expect(pool.some((s) => s.slug === 'rattata-alola')).toBe(false); // se puede evolucionar
    // por generación: Alola es de 7.ª, Hisui de 8.ª
    expect(speciesPool({ generations: [7] }).some((s) => s.slug === 'ninetales-alola')).toBe(true);
    expect(speciesPool({ generations: [1] }).some((s) => s.slug === 'ninetales-alola')).toBe(false);
    for (let seed = 1; seed <= 300; seed++) for (const p of rollTeam(createRng(seed), { allowLegendary: true, finalStageOnly: false })) expect(getSpecies(p.speciesId).form?.kind).not.toBe('mega');
  });

  it('los filtros de generación, legendarios y última etapa funcionan', () => {
    const base = speciesPool().length;
    expect(speciesPool({ allowLegendary: true }).length).toBeGreaterThan(base);
    expect(speciesPool({ finalStageOnly: false }).length).toBeGreaterThan(base);
    expect(speciesPool({ finalStageOnly: false, allowLegendary: true })).toHaveLength(1082); // 1025 + 57 formas regionales
    for (const s of speciesPool({ generations: [4, 9] })) expect([4, 9]).toContain(s.generation);
    expect(speciesPool({ generations: [] })).toHaveLength(0);
    // con todo abierto salen Pokémon de las 9 generaciones, legendarios y sin evolucionar
    const seen = new Set<number>();
    let legendary = 0;
    let unevolved = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (const p of rollTeam(createRng(seed), { allowLegendary: true, finalStageOnly: false })) {
        const s = getSpecies(p.speciesId);
        seen.add(s.generation);
        if (s.legendary) legendary++;
        if (!s.finalStage) unevolved++;
      }
    }
    expect(seen.size).toBe(9);
    expect(legendary).toBeGreaterThan(0);
    expect(unevolved).toBeGreaterThan(0);
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
