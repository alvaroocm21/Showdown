import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { roundRobin } from '../src/core/game/schedule';
import { computeStandings } from '../src/core/game/standings';
import { archiveSeason, champion, createSeason, currentRound, findMatch, isSeasonComplete, pendingInRound, recordResult, allMatches } from '../src/core/game/season';
import { createProfile, moveTeamMember, validateName } from '../src/core/game/profiles';
import { addProfile, canRerollTeam, inSeason, recordMatch, removeProfile, startSeason, updateProfile } from '../src/core/game/state';
import { matchResultFrom, outcomeOf, resultForMatch, simulateMatch } from '../src/core/game/play';
import { createBattle } from '../src/core/battle/state';
import { simulateBattle } from '../src/core/battle/sim';
import { emptyGame, type GameState, type MatchResult, type Season } from '../src/core/game/types';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const win = (winner: string, faintedA = 6, faintedB = 6): MatchResult => ({ winner, faintedA, faintedB, mode: 'played' });

describe('calendario (todos contra todos, solo ida)', () => {
  for (const n of [4, 5, 6, 7, 8]) {
    it(`${n} perfiles: cada pareja juega una vez y nadie repite en una jornada`, () => {
      const { rounds, byes } = roundRobin(ids(n), createRng(n));
      const expectedRounds = n % 2 === 0 ? n - 1 : n;
      expect(rounds).toHaveLength(expectedRounds);
      expect(byes).toHaveLength(expectedRounds);
      const pairs = new Set<string>();
      for (const [r, fixtures] of rounds.entries()) {
        const seen = new Set<string>();
        for (const f of fixtures) {
          expect(f.a).not.toBe(f.b);
          for (const id of [f.a, f.b]) {
            expect(seen.has(id), `${id} repetido en la jornada ${r}`).toBe(false);
            seen.add(id);
          }
          pairs.add([f.a, f.b].sort().join('|'));
        }
        if (byes[r]) {
          expect(seen.has(byes[r]!)).toBe(false);
          seen.add(byes[r]!);
        }
        expect(seen.size).toBe(n); // todos juegan o descansan
      }
      expect(pairs.size).toBe((n * (n - 1)) / 2);
      if (n % 2 === 1) expect(new Set(byes).size).toBe(n); // cada uno descansa una vez
      else expect(byes.every((b) => b === null)).toBe(true);
    });
  }

  it('es determinista con la misma semilla y cambia con otra', () => {
    expect(roundRobin(ids(6), createRng(1))).toEqual(roundRobin(ids(6), createRng(1)));
    expect(roundRobin(ids(6), createRng(1))).not.toEqual(roundRobin(ids(6), createRng(2)));
  });

  it('rechaza menos de 4, más de 8 o perfiles repetidos', () => {
    expect(() => roundRobin(ids(3), createRng(1))).toThrow(/entre 4 y 8/);
    expect(() => roundRobin(ids(9), createRng(1))).toThrow(/entre 4 y 8/);
    expect(() => roundRobin(['a', 'a', 'b', 'c'], createRng(1))).toThrow(/repetidos/);
  });
});

function playedSeason(): Season {
  // p1 gana a todos; p2 gana a p3 y p4; p3 gana a p4
  let s = createSeason(1, ids(4), createRng(5), 1000);
  const winners: Record<string, string> = {};
  for (const m of allMatches(s)) {
    const order = [m.a, m.b].sort();
    winners[m.id] = order[0]!; // el de menor número gana
  }
  for (const m of allMatches(s)) {
    const w = winners[m.id]!;
    // debilitados: el ganador pierde 2, el perdedor 6
    s = recordResult(s, m.id, { winner: w, faintedA: m.a === w ? 2 : 6, faintedB: m.b === w ? 2 : 6, mode: 'played' }, 2000);
  }
  return s;
}

describe('clasificación', () => {
  it('suma 3 puntos por victoria y cuenta PJ, PG, PP y debilitados', () => {
    const rows = computeStandings(playedSeason());
    expect(rows.map((r) => r.profileId)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(rows.map((r) => r.points)).toEqual([9, 6, 3, 0]);
    expect(rows.map((r) => [r.played, r.won, r.lost])).toEqual([[3, 3, 0], [3, 2, 1], [3, 1, 2], [3, 0, 3]]);
    // p1: causó 6+6+6 = 18, sufrió 2+2+2 = 6 → +12
    expect(rows[0]).toMatchObject({ faintedCaused: 18, faintedSuffered: 6, diff: 12 });
    expect(rows[3]).toMatchObject({ faintedCaused: 6, faintedSuffered: 18, diff: -12 });
  });

  it('desempata por diferencia de debilitados y luego por nombre', () => {
    let s = createSeason(1, ids(4), createRng(9), 1);
    // todos los combates ganados por el primero (a), pero con resultados distintos
    const ms = allMatches(s);
    s = recordResult(s, ms[0]!.id, win(ms[0]!.a, 0, 6));
    const rows0 = computeStandings(s);
    expect(rows0[0]!.profileId).toBe(ms[0]!.a);
    // sin resultados no hay puntos y se ordena por nombre
    const none = computeStandings(createSeason(1, ['d', 'c', 'b', 'a'], createRng(1)), new Map([['a', 'Ana'], ['b', 'Beto'], ['c', 'Carla'], ['d', 'Dani']]));
    expect(none.map((r) => r.profileId)).toEqual(['a', 'b', 'c', 'd']);

    // empate a puntos: gana quien tiene mejor diferencia (dos combates de la misma jornada, sin jugadores comunes)
    let t = createSeason(1, ids(4), createRng(3));
    const [m1, m2] = t.rounds[0]!;
    t = recordResult(t, m1!.id, { winner: m1!.a, faintedA: 5, faintedB: 6, mode: 'played' }); // +1
    t = recordResult(t, m2!.id, { winner: m2!.a, faintedA: 0, faintedB: 6, mode: 'played' }); // +6
    const rows = computeStandings(t);
    expect(rows[0]!.profileId).toBe(m2!.a);
    expect(rows[1]!.profileId).toBe(m1!.a);
    expect(rows[0]!.points).toBe(rows[1]!.points);
  });
});

describe('temporada', () => {
  it('avanza de jornada y termina cuando están todos los resultados', () => {
    let s = createSeason(1, ids(5), createRng(2));
    expect(currentRound(s)).toBe(0);
    expect(isSeasonComplete(s)).toBe(false);
    expect(champion(s)).toBeNull();
    for (const m of allMatches(s)) {
      const r = currentRound(s)!;
      expect(m.round).toBeGreaterThanOrEqual(r);
      s = recordResult(s, m.id, win(m.a, 1, 6), 777);
    }
    expect(currentRound(s)).toBeNull();
    expect(s.finishedAt).toBe(777);
    expect(champion(s)).toBeTruthy();
  });

  it('no deja jugar dos veces un combate ni con un ganador ajeno, y no modifica el original', () => {
    const s = createSeason(1, ids(4), createRng(2));
    const m = allMatches(s)[0]!;
    const s2 = recordResult(s, m.id, win(m.a));
    expect(findMatch(s, m.id)!.result).toBeNull();
    expect(() => recordResult(s2, m.id, win(m.b))).toThrow(/ya está jugado/);
    expect(() => recordResult(s, m.id, win('zzz'))).toThrow(/no participa/);
    expect(() => recordResult(s, 'nope', win(m.a))).toThrow(/desconocido/);
    expect(pendingInRound(s2, m.round)).toHaveLength(pendingInRound(s, m.round).length - 1);
  });

  it('al archivarla pasa al historial con el campeón y la siguiente temporada sube de número', () => {
    const rng = createRng(1);
    let state = emptyGame();
    for (const name of ['Ana', 'Beto', 'Carla', 'Dani']) state = addProfile(state, createProfile(name, rng, state.profiles));
    state = startSeason(state, state.profiles.map((p) => p.id), rng, 100);
    expect(() => archiveSeason(state)).toThrow(/no ha terminado/);
    for (const m of allMatches(state.season!)) state = recordMatch(state, m.id, win(m.a, 3, 6), 200);
    const next = archiveSeason(state);
    expect(next.season).toBeNull();
    expect(next.nextSeasonNumber).toBe(2);
    expect(next.history).toHaveLength(1);
    const rec = next.history[0]!;
    expect(rec.number).toBe(1);
    expect(rec.standings).toHaveLength(4);
    expect(rec.championName).toBe(next.profiles.find((p) => p.id === rec.championId)!.name);
    expect(startSeason(next, next.profiles.map((p) => p.id), rng).season!.number).toBe(2);
  });
});

describe('perfiles y partida', () => {
  it('valida los nombres', () => {
    const rng = createRng(1);
    const a = createProfile('Ana', rng, []);
    expect(validateName('', [a])).toMatch(/nombre/);
    expect(validateName('   ', [a])).toMatch(/nombre/);
    expect(validateName('ANA', [a])).toMatch(/Ya existe/);
    expect(validateName('ANA', [a], a.id)).toBeNull();
    expect(validateName('x'.repeat(19), [a])).toMatch(/Máximo/);
    expect(validateName('Beto', [a])).toBeNull();
    expect(() => createProfile('ana', rng, [a])).toThrow(/Ya existe/);
  });

  it('cada perfil recibe un plantilla de 15 distintos y avatares diferentes', () => {
    const rng = createRng(4);
    const profiles: ReturnType<typeof createProfile>[] = [];
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) profiles.push(createProfile(n, rng, profiles));
    for (const p of profiles) {
      expect(p.team).toHaveLength(15);
      expect(new Set(p.team.map((s) => s.speciesId)).size).toBe(15);
      expect(p.coins).toBe(0);
      expect(p.main).toBe(false);
    }
    expect(new Set(profiles.map((p) => p.avatar.emoji)).size).toBe(6);
    expect(new Set(profiles.map((p) => p.id)).size).toBe(6);
  });

  it('reordena el equipo sin salirse de los límites', () => {
    const p = createProfile('Ana', createRng(1), []);
    const ids0 = p.team.map((s) => s.speciesId);
    const moved = moveTeamMember(p, 2, -1);
    expect(moved.team.map((s) => s.speciesId)).toEqual([ids0[0], ids0[2], ids0[1], ...ids0.slice(3)]);
    expect(moveTeamMember(p, 0, -1)).toBe(p);
    expect(moveTeamMember(p, 14, 1)).toBe(p);
  });

  it('reglas de la liga: no se borra ni re-sortea con la temporada en juego', () => {
    const rng = createRng(2);
    let state = emptyGame();
    for (const n of ['Ana', 'Beto', 'Carla', 'Dani', 'Eva']) state = addProfile(state, createProfile(n, rng, state.profiles));
    const extra = state.profiles[4]!.id;
    expect(canRerollTeam(state)).toBe(true);
    expect(() => startSeason(state, state.profiles.slice(0, 3).map((p) => p.id), rng)).toThrow(/entre 4 y 8/);
    expect(() => startSeason(state, ['x', 'y', 'z', 'w'], rng)).toThrow(/desconocido/);
    state = startSeason(state, state.profiles.slice(0, 4).map((p) => p.id), rng);
    expect(() => startSeason(state, state.profiles.slice(0, 4).map((p) => p.id), rng)).toThrow(/en curso/);
    expect(canRerollTeam(state)).toBe(false);
    expect(inSeason(state, state.profiles[0]!.id)).toBe(true);
    expect(() => removeProfile(state, state.profiles[0]!.id)).toThrow(/participa/);
    expect(removeProfile(state, extra).profiles).toHaveLength(4); // quien no juega sí se puede borrar
    const toggled = updateProfile(state, extra, (p) => ({ ...p, main: true }));
    expect(toggled.profiles.find((p) => p.id === extra)!.main).toBe(true);
  });
});

describe('combates entre perfiles', () => {
  it('el resultado refleja ganador y Pokémon debilitados', () => {
    const rng = createRng(11);
    const a = createProfile('A', rng, []);
    const b = createProfile('B', rng, [a]);
    for (let seed = 1; seed <= 60; seed++) {
      const r = simulateMatch(a, b, createRng(seed));
      expect([a.id, b.id]).toContain(r.winner);
      expect(r.mode).toBe('simulated');
      const loserFainted = r.winner === a.id ? r.faintedB : r.faintedA;
      const winnerFainted = r.winner === a.id ? r.faintedA : r.faintedB;
      expect(loserFainted).toBe(6);
      expect(winnerFainted).toBeLessThan(7);
      expect(simulateMatch(a, b, createRng(seed))).toEqual(r); // determinista
    }
  });

  it('matchResultFrom traduce el bando ganador al perfil', () => {
    const rng = createRng(3);
    const a = createProfile('A', rng, []);
    const b = createProfile('B', rng, [a]);
    expect(matchResultFrom(a, b, { winner: 1, fainted: [6, 2], fallen: [[], []] }, 'played')).toEqual({ winner: b.id, faintedA: 6, faintedB: 2, mode: 'played', fallenA: [], fallenB: [] });
    const battle = createBattle(a.team.slice(0, 6), b.team.slice(0, 6));
    expect(() => outcomeOf(battle)).toThrow(/no ha terminado/);
    simulateBattle(battle, createRng(8));
    const out = outcomeOf(battle);
    expect(out.fainted[out.winner === 0 ? 1 : 0]).toBe(6);
  });
});

export type { GameState };

describe('resultado de un combate jugado por el usuario', () => {
  const match = { a: 'A', b: 'B' };
  it('con el perfil que figura como a', () => {
    expect(resultForMatch(match, 'A', { winner: 0, fainted: [3, 6], fallen: [[], []] }, 'played')).toEqual({ winner: 'A', faintedA: 3, faintedB: 6, mode: 'played', fallenA: [], fallenB: [] });
    expect(resultForMatch(match, 'A', { winner: 1, fainted: [6, 2], fallen: [[], []] }, 'played')).toEqual({ winner: 'B', faintedA: 6, faintedB: 2, mode: 'played', fallenA: [], fallenB: [] });
  });
  it('con el perfil que figura como b (el bando 0 del combate es b)', () => {
    expect(resultForMatch(match, 'B', { winner: 0, fainted: [3, 6], fallen: [[], []] }, 'played')).toEqual({ winner: 'B', faintedA: 6, faintedB: 3, mode: 'played', fallenA: [], fallenB: [] });
    expect(resultForMatch(match, 'B', { winner: 1, fainted: [6, 2], fallen: [[], []] }, 'played')).toEqual({ winner: 'A', faintedA: 2, faintedB: 6, mode: 'played', fallenA: [], fallenB: [] });
  });
  it('rechaza un perfil ajeno', () => {
    expect(() => resultForMatch(match, 'Z', { winner: 0, fainted: [0, 6], fallen: [[], []] }, 'played')).toThrow(/no participa/);
  });
});
