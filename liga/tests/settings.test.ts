import { describe, expect, it } from 'vitest';
import { drawOptions, drawOptionsOf, poolSize, speciesPerGeneration, totalDrawable, validateDraw } from '../src/core/game/settings';
import { updateDraw } from '../src/core/game/state';
import { createProfile } from '../src/core/game/profiles';
import { applyUpgrade } from '../src/core/game/shop';
import { emptyGame, defaultSettings, type GameState } from '../src/core/game/types';
import { getSpecies } from '../src/core/data';
import { rollTeam, speciesPool } from '../src/core/generator';
import { createRng } from '../src/core/rng';

describe('ajustes del sorteo', () => {
  it('por defecto está todo abierto: 9 generaciones, legendarios y solo última etapa', () => {
    const d = defaultSettings().draw;
    expect(d).toEqual({ generations: [1, 2, 3, 4, 5, 6, 7, 8, 9], legendaries: true, finalStageOnly: true });
    expect(validateDraw(d)).toBeNull();
    expect(poolSize(d)).toBe(speciesPool({ allowLegendary: true }).length);
    expect(drawOptions(d)).toEqual({ generations: d.generations, allowLegendary: true, finalStageOnly: true });
  });

  it('valida: al menos una generación, sin repetidas ni desconocidas', () => {
    const d = defaultSettings().draw;
    expect(validateDraw({ ...d, generations: [] })).toMatch(/al menos una/);
    expect(validateDraw({ ...d, generations: [1, 1] })).toMatch(/repetidas/);
    expect(validateDraw({ ...d, generations: [10] })).toMatch(/desconocida/);
    expect(validateDraw({ ...d, generations: [6] })).toBeNull();
  });

  it('cuenta los Pokémon por generación', () => {
    const per = speciesPerGeneration();
    expect(Object.values(per).reduce((a, b) => a + b, 0)).toBe(1082); // 1025 + 57 formas regionales (las megas no se sortean)
    expect(per[1]).toBe(151);
    expect(per[7]).toBe(88 + 18); // + Alola
    expect(per[8]).toBe(96 + 19 + 16); // + Galar + Hisui
    expect(per[9]).toBe(120 + 4); // + Paldea
    expect(totalDrawable()).toBe(1082);
  });

  it('updateDraw cambia solo los ajustes (ordena las generaciones) y rechaza los inválidos', () => {
    const state = emptyGame();
    const next = updateDraw(state, { generations: [3, 1], legendaries: false, finalStageOnly: false });
    expect(next.settings.draw).toEqual({ generations: [1, 3], legendaries: false, finalStageOnly: false });
    expect(state.settings.draw.generations).toHaveLength(9); // el original no se modifica
    expect(() => updateDraw(state, { generations: [], legendaries: true, finalStageOnly: true })).toThrow(/al menos una/);
  });

  it('los sorteos respetan los ajustes: equipos nuevos y Pokémon comprados', () => {
    let state: GameState = updateDraw(emptyGame(), { generations: [1], legendaries: false, finalStageOnly: true });
    const rng = createRng(3);
    for (const n of ['A', 'B', 'C', 'D']) state = { ...state, profiles: [...state.profiles, createProfile(n, rng, state.profiles, { generate: drawOptionsOf(state) })] };
    for (const p of state.profiles) for (const s of p.team) {
      const sp = getSpecies(s.speciesId);
      expect(sp.generation).toBe(1);
      expect(sp.legendary).toBe(false);
      expect(sp.finalStage).toBe(true);
    }
    const rich = { ...state, profiles: state.profiles.map((p, i) => (i === 0 ? { ...p, coins: 150 } : p)) };
    for (let seed = 1; seed <= 200; seed++) {
      const res = applyUpgrade(rich, rich.profiles[0]!.id, { kind: 'pokemon', pokemon: seed % 6 }, createRng(seed));
      const sp = getSpecies(res.state.profiles[0]!.team[seed % 6]!.speciesId);
      expect(sp.generation, `semilla ${seed}`).toBe(1);
    }
    for (const p of rollTeam(createRng(9), drawOptionsOf(state))) expect(getSpecies(p.speciesId).generation).toBe(1);
  });
});
