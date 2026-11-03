import { describe, expect, it } from 'vitest';
import { createBattle } from '../src/core/battle/state';
import { simulateBattle } from '../src/core/battle/sim';
import { headToHead } from '../src/core/game/history';
import { autoLineup, autoLineupFor, availableSets, LINEUP_SIZE, unavailableSpecies } from '../src/core/game/lineup';
import { outcomeOf, resultForMatch, simulateMatch } from '../src/core/game/play';
import { createProfile } from '../src/core/game/profiles';
import { recordMatch, startSeason, addProfile } from '../src/core/game/state';
import { emptyGame, type GameState } from '../src/core/game/types';
import { deserialize, migrate, serialize, validateGameState } from '../src/storage/save';
import { createRng } from '../src/core/rng';
import { MOVES, SPECIES } from '../src/core/data';
import { rollTeam } from '../src/core/generator';

function league(): GameState {
  const rng = createRng(21);
  let state = emptyGame();
  for (const n of ['Ana', 'Beto', 'Carla', 'Dani']) state = addProfile(state, createProfile(n, rng, state.profiles, { main: n === 'Ana' || n === 'Beto' }));
  return startSeason(state, state.profiles.map((p) => p.id), createRng(3), 1000);
}

describe('plantilla de 15 y alineación de 6', () => {
  it('la alineación automática elige 6 distintos de los disponibles', () => {
    const state = league();
    const p = state.profiles[0]!;
    const free = availableSets(p, new Set([p.team[0]!.speciesId, p.team[1]!.speciesId]));
    expect(free).toHaveLength(13);
    const lineup = autoLineup(free, createRng(1));
    expect(lineup).toHaveLength(LINEUP_SIZE);
    expect(new Set(lineup.map((s) => s.speciesId)).size).toBe(LINEUP_SIZE);
    expect(lineup.every((s) => free.includes(s))).toBe(true);
  });

  it('el resultado guarda los Pokémon debilitados de cada bando y descansan la jornada siguiente', () => {
    let state = league();
    const season = state.season!;
    const m = season.rounds[0]![0]!;
    const a = state.profiles.find((p) => p.id === m.a)!;
    const b = state.profiles.find((p) => p.id === m.b)!;
    const lineA = a.team.slice(0, 6);
    const lineB = b.team.slice(0, 6);
    const battle = createBattle(lineA, lineB);
    simulateBattle(battle, createRng(5));
    const out = outcomeOf(battle);
    expect(out.fallen[0]).toHaveLength(out.fainted[0]);
    const result = resultForMatch(m, a.id, out, 'played');
    expect(result.fallenA).toEqual(out.fallen[0]);
    expect(result.fallenB).toEqual(out.fallen[1]);
    state = recordMatch(state, m.id, result, 2000);

    // En la jornada 2 (índice 1) no pueden jugar los debilitados en la 1, ni en la alineación automática
    expect([...unavailableSpecies(state.season, a.id, 1)].sort()).toEqual([...out.fallen[0]].sort());
    expect([...unavailableSpecies(state.season, b.id, 1)].sort()).toEqual([...out.fallen[1]].sort());
    for (let seed = 1; seed <= 20; seed++) {
      const next = autoLineupFor(state, a.id, 1, createRng(seed));
      expect(next).toHaveLength(6);
      for (const id of out.fallen[0]) expect(next.some((s) => s.speciesId === id)).toBe(false);
    }
    // En la jornada 1 (primera) y en la 3 no hay restricción
    expect(unavailableSpecies(state.season, a.id, 0).size).toBe(0);
    expect(unavailableSpecies(state.season, a.id, 2).size).toBe(0);
  });

  it('una simulación devuelve también quién cayó', () => {
    const state = league();
    const [a, b] = state.profiles;
    const r = simulateMatch(a!, b!, createRng(2));
    expect(r.fallenA).toHaveLength(r.faintedA);
    expect(r.fallenB).toHaveLength(r.faintedB);
  });
});

describe('historial entre cuentas', () => {
  it('cuenta victorias y Pokémon debilitados en cualquier orden de la pareja', () => {
    let state = league();
    const rounds = state.season!.rounds;
    const all = rounds.flat();
    const m = all[0]!;
    state = recordMatch(state, m.id, { winner: m.a, faintedA: 2, faintedB: 6, mode: 'played' }, 5);
    const h = headToHead(state, m.a, m.b);
    expect(h.matches).toHaveLength(1);
    expect([h.winsA, h.winsB]).toEqual([1, 0]);
    expect([h.faintedCausedByA, h.faintedCausedByB]).toEqual([6, 2]);
    const rev = headToHead(state, m.b, m.a);
    expect([rev.winsA, rev.winsB]).toEqual([0, 1]);
    expect([rev.faintedCausedByA, rev.faintedCausedByB]).toEqual([2, 6]);
    expect(headToHead(state, m.a, 'otro').matches).toHaveLength(0);
  });
});

describe('guardado v3', () => {
  it('ida y vuelta con registro y Pokémon debilitados', () => {
    let state = league();
    const m = state.season!.rounds[0]![0]!;
    state = recordMatch(state, m.id, { winner: m.a, faintedA: 1, faintedB: 6, mode: 'played', fallenA: [5], fallenB: [1, 2, 3, 4, 6, 7] });
    expect(deserialize(serialize(state))).toEqual(state);
    expect(() => validateGameState({ ...JSON.parse(serialize(state)), matchLog: [{ nope: 1 }] })).toThrow();
  });

  it('migra una partida v2: completa las plantillas a 15 y pasa los combates jugados al registro', () => {
    let state = league();
    const m = state.season!.rounds[0]![0]!;
    state = recordMatch(state, m.id, { winner: m.a, faintedA: 1, faintedB: 6, mode: 'played' });
    const v2 = JSON.parse(serialize(state));
    v2.version = 2;
    delete v2.matchLog;
    for (const p of v2.profiles) p.team = p.team.slice(0, 6);
    const upgraded = validateGameState(migrate(v2));
    for (const p of upgraded.profiles) {
      expect(p.team).toHaveLength(15);
      expect(new Set(p.team.map((s) => s.speciesId)).size).toBe(15);
    }
    expect(upgraded.matchLog).toHaveLength(1);
    expect(upgraded.matchLog[0]!.aId).toBe(m.a);
  });
});

describe('sin Teracristalización', () => {
  it('no se sortean sus ataques ni Terapagos, y una partida v3 con ellos se limpia', () => {
    const terapagos = SPECIES.find((s) => s.slug.startsWith('terapagos'))!;
    const blast = MOVES.find((m) => m.slug === 'tera-blast')!;
    for (let seed = 1; seed <= 200; seed++) {
      for (const p of rollTeam(createRng(seed), { allowLegendary: true, finalStageOnly: false })) {
        expect(p.speciesId).not.toBe(terapagos.id);
        expect(p.moveIds).not.toContain(blast.id);
      }
    }
    const state = league();
    const raw = JSON.parse(serialize(state));
    raw.version = 3;
    raw.profiles[0].team[0].moveIds[0] = blast.id;
    raw.profiles[0].team[1].speciesId = terapagos.id;
    const clean = validateGameState(migrate(raw));
    expect(clean.profiles[0]!.team[0]!.moveIds).not.toContain(blast.id);
    expect(clean.profiles[0]!.team.some((s) => s.speciesId === terapagos.id)).toBe(false);
    expect(new Set(clean.profiles[0]!.team.map((s) => s.speciesId)).size).toBe(15);
  });
});
