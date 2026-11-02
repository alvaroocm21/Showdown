import { describe, expect, it } from 'vitest';
import { getAbility, getMove, getSpecies } from '../src/core/data';
import { SURVIVOR_COINS, UPGRADE_COSTS, WIN_COINS, matchReward, rewardFor } from '../src/core/game/economy';
import { createProfile } from '../src/core/game/profiles';
import { allMatches } from '../src/core/game/season';
import { applyUpgrade, upgradeCost } from '../src/core/game/shop';
import { addProfile, recordMatch, startSeason } from '../src/core/game/state';
import { emptyGame, type GameState } from '../src/core/game/types';
import { isDirectDamage, isPlayableMoveset } from '../src/core/generator';
import { createRng } from '../src/core/rng';

function league(n = 4): GameState {
  const rng = createRng(77);
  let state = emptyGame();
  for (const name of ['Ana', 'Beto', 'Carla', 'Dani', 'Eva', 'Fran', 'Gus', 'Hugo'].slice(0, n)) state = addProfile(state, createProfile(name, rng, state.profiles));
  return state;
}
/** Liga nueva en la que el perfil `index` tiene `coins` monedas (los ids llevan la hora: se crea una sola vez). */
const rich = (coins: number, index = 0): GameState => {
  const state = league();
  const id = state.profiles[index]!.id;
  return { ...state, profiles: state.profiles.map((p) => (p.id === id ? { ...p, coins } : p)) };
};

describe('monedas por ganar', () => {
  it('100 por la victoria y 10 por cada Pokémon propio que sobrevive', () => {
    expect(matchReward(0)).toBe(WIN_COINS + 6 * SURVIVOR_COINS);
    expect(matchReward(3)).toBe(WIN_COINS + 3 * SURVIVOR_COINS);
    expect(matchReward(5)).toBe(WIN_COINS + SURVIVOR_COINS);
    expect(matchReward(6)).toBe(WIN_COINS);
    expect(matchReward(9)).toBe(WIN_COINS); // nunca baja de la base
  });

  it('cobra el ganador, sea a o b', () => {
    const match = { a: 'A', b: 'B' };
    expect(rewardFor(match, { winner: 'A', faintedA: 2, faintedB: 6, mode: 'played' })).toEqual({ profileId: 'A', coins: 140 });
    expect(rewardFor(match, { winner: 'B', faintedA: 6, faintedB: 1, mode: 'played' })).toEqual({ profileId: 'B', coins: 150 });
  });

  it('se paga al anotar el resultado y solo al ganador (también si se simula)', () => {
    let state = league(4);
    state = startSeason(state, state.profiles.map((p) => p.id), createRng(1));
    const m = allMatches(state.season!)[0]!;
    state = recordMatch(state, m.id, { winner: m.b, faintedA: 6, faintedB: 4, mode: 'simulated' });
    const coins = (id: string) => state.profiles.find((p) => p.id === id)!.coins;
    expect(coins(m.b)).toBe(matchReward(4));
    expect(coins(m.a)).toBe(0);
    // un combate ya anotado no vuelve a pagar
    expect(() => recordMatch(state, m.id, { winner: m.a, faintedA: 0, faintedB: 6, mode: 'played' })).toThrow();
    expect(coins(m.b)).toBe(matchReward(4));
    // las monedas se acumulan entre jornadas
    const later = allMatches(state.season!).find((x) => !x.result && (x.a === m.b || x.b === m.b))!;
    state = recordMatch(state, later.id, { winner: m.b, faintedA: later.a === m.b ? 0 : 6, faintedB: later.b === m.b ? 0 : 6, mode: 'played' });
    expect(coins(m.b)).toBe(matchReward(4) + matchReward(0));
  });
});

describe('mejoras con monedas', () => {
  const id = (s: GameState) => s.profiles[0]!.id;

  it('los precios son los acordados', () => {
    expect(UPGRADE_COSTS).toEqual({ move: 60, ability: 80, pokemon: 150 });
    expect(upgradeCost({ kind: 'move', pokemon: 0, slot: 0 })).toBe(60);
    expect(upgradeCost('ability')).toBe(80);
  });

  it('sin monedas suficientes falla y no cambia nada', () => {
    const state = rich(59);
    for (const u of [{ kind: 'move', pokemon: 0, slot: 0 }, { kind: 'ability', pokemon: 0 }, { kind: 'pokemon', pokemon: 0 }] as const) {
      expect(() => applyUpgrade(state, id(state), u, createRng(1))).toThrow(/Faltan monedas/);
    }
    expect(state.profiles[0]!.coins).toBe(59);
  });

  it('re-sortear un ataque: cambia solo ese ataque, descuenta 60 y el set sigue siendo jugable', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const base = rich(100);
      const slot = seed % 4;
      const before = base.profiles[0]!.team[seed % 6]!;
      const res = applyUpgrade(base, id(base), { kind: 'move', pokemon: seed % 6, slot }, createRng(seed));
      const after = res.state.profiles[0]!.team[seed % 6]!;
      expect(res.state.profiles[0]!.coins).toBe(40);
      expect(after.moveIds).toHaveLength(4);
      expect(new Set(after.moveIds).size).toBe(4);
      expect(after.moveIds[slot]).not.toBe(before.moveIds[slot]);
      after.moveIds.forEach((m, i) => i !== slot && expect(m).toBe(before.moveIds[i]));
      expect(isPlayableMoveset(getSpecies(after.speciesId), after.moveIds)).toBe(true);
      expect(after.moveIds.map(getMove).filter(isDirectDamage).length).toBeGreaterThanOrEqual(2);
      expect(after.abilityId).toBe(before.abilityId);
      expect(res).toMatchObject({ kind: 'move', cost: 60, slot, before: getMove(before.moveIds[slot]!).name, after: getMove(after.moveIds[slot]!).name });
    }
  });

  it('re-sortear la habilidad: otra distinta, 80 monedas, el resto igual', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const base = rich(80);
      const before = base.profiles[0]!.team[0]!;
      const res = applyUpgrade(base, id(base), { kind: 'ability', pokemon: 0 }, createRng(seed));
      const after = res.state.profiles[0]!.team[0]!;
      expect(res.state.profiles[0]!.coins).toBe(0);
      expect(after.abilityId).not.toBe(before.abilityId);
      expect(after.moveIds).toEqual(before.moveIds);
      expect(after.speciesId).toBe(before.speciesId);
      expect(res.after).toBe(getAbility(after.abilityId).name);
    }
  });

  it('sustituir un Pokémon: uno nuevo, de última etapa, que no esté ya en el equipo, en la misma posición', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const base = rich(200);
      const team = base.profiles[0]!.team;
      const idx = seed % 6;
      const res = applyUpgrade(base, id(base), { kind: 'pokemon', pokemon: idx }, createRng(seed));
      const after = res.state.profiles[0]!.team;
      expect(res.state.profiles[0]!.coins).toBe(50);
      expect(after).toHaveLength(15);
      expect(new Set(after.map((s) => s.speciesId)).size).toBe(15);
      expect(after[idx]!.speciesId).not.toBe(team[idx]!.speciesId);
      expect(getSpecies(after[idx]!.speciesId).finalStage).toBe(true);
      expect(after[idx]!.build).toEqual(team[idx]!.build);
      expect(isPlayableMoveset(getSpecies(after[idx]!.speciesId), after[idx]!.moveIds)).toBe(true);
      after.forEach((s, i) => i !== idx && expect(s).toEqual(team[i]));
    }
  });

  it('un Pokémon nuevo nunca repite uno que ya está en el equipo (muchas semillas)', () => {
    const base = rich(150);
    const taken = new Set(base.profiles[0]!.team.map((s) => s.speciesId));
    for (let seed = 1; seed <= 1500; seed++) {
      const res = applyUpgrade(base, base.profiles[0]!.id, { kind: 'pokemon', pokemon: seed % 6 }, createRng(seed));
      const team = res.state.profiles[0]!.team;
      expect(new Set(team.map((s) => s.speciesId)).size, `semilla ${seed}`).toBe(15);
      expect(taken.has(team[seed % 6]!.speciesId), `semilla ${seed}`).toBe(false);
    }
  });

  it('solo afecta al perfil elegido y no modifica el estado original', () => {
    const base = rich(500, 1);
    const snapshot = JSON.stringify(base);
    const res = applyUpgrade(base, base.profiles[1]!.id, { kind: 'pokemon', pokemon: 2 }, createRng(5));
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(res.state.profiles[0]).toEqual(base.profiles[0]);
    expect(res.state.profiles[2]).toEqual(base.profiles[2]);
  });

  it('rechaza perfil, Pokémon o ataque inexistentes', () => {
    const base = rich(500);
    expect(() => applyUpgrade(base, 'nadie', { kind: 'ability', pokemon: 0 }, createRng(1))).toThrow(/Perfil/);
    expect(() => applyUpgrade(base, id(base), { kind: 'ability', pokemon: 99 }, createRng(1))).toThrow(/Pokémon/);
    expect(() => applyUpgrade(base, id(base), { kind: 'move', pokemon: 0, slot: 4 }, createRng(1))).toThrow(/Ataque/);
    expect(() => applyUpgrade(base, id(base), { kind: 'move', pokemon: 0, slot: -1 }, createRng(1))).toThrow(/Ataque/);
  });

  it('es determinista con la misma semilla', () => {
    const base = rich(500);
    const a = applyUpgrade(base, id(base), { kind: 'move', pokemon: 1, slot: 2 }, createRng(9));
    const b = applyUpgrade(base, id(base), { kind: 'move', pokemon: 1, slot: 2 }, createRng(9));
    expect(a.state).toEqual(b.state);
  });
});
