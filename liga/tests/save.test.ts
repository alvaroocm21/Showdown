import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { createProfile } from '../src/core/game/profiles';
import { addProfile, recordMatch, startSeason } from '../src/core/game/state';
import { allMatches } from '../src/core/game/season';
import { simulateMatch } from '../src/core/game/play';
import { SAVE_VERSION, emptyGame, type GameState } from '../src/core/game/types';
import {
  BACKUP_KEY, EXPORT_FORMAT, STORAGE_KEY, SaveError, deserialize, exportGame, importGame, loadGame, migrate, saveGame, serialize,
  validateGameState, type KeyValueStore,
} from '../src/storage/save';

function memStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

function sampleGame(played = 3): GameState {
  const rng = createRng(21);
  let state = emptyGame();
  for (const n of ['Ana', 'Beto', 'Carla', 'Dani', 'Eva']) state = addProfile(state, createProfile(n, rng, state.profiles, { main: n === 'Ana' }));
  state = startSeason(state, state.profiles.map((p) => p.id), rng, 5000);
  for (const m of allMatches(state.season!).slice(0, played)) {
    const a = state.profiles.find((p) => p.id === m.a)!;
    const b = state.profiles.find((p) => p.id === m.b)!;
    state = recordMatch(state, m.id, simulateMatch(a, b, rng), 6000);
  }
  return state;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const reject = (mutate: (s: any) => void, message: RegExp) => {
  const raw = clone(sampleGame());
  mutate(raw);
  expect(() => validateGameState(raw)).toThrow(SaveError);
  expect(() => validateGameState(raw)).toThrow(message);
};

describe('guardado: serializar y validar', () => {
  it('ida y vuelta sin pérdidas (equipos, temporada a medias y resultados)', () => {
    const state = sampleGame(4);
    expect(deserialize(serialize(state))).toEqual(state);
    expect(deserialize(serialize(emptyGame()))).toEqual(emptyGame());
  });

  it('también con la temporada terminada y el historial', () => {
    const state = sampleGame(10); // 5 perfiles = 10 combates
    expect(state.season!.finishedAt).not.toBeNull();
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('rechaza datos que no existen en el juego', () => {
    reject((s) => (s.profiles[0].team[0].speciesId = 99999), /Pokémon desconocido/);
    reject((s) => (s.profiles[0].team[0].abilityId = 99999), /habilidad desconocida/);
    reject((s) => (s.profiles[0].team[0].moveIds[0] = 99999), /ataque desconocido/);
    reject((s) => (s.profiles[0].team[0].build.natureId = 9999), /naturaleza/);
  });

  it('rechaza equipos y sets mal formados', () => {
    reject((s) => (s.profiles[0].team[0].moveIds = [1, 2, 3]), /4 ataques/);
    reject((s) => (s.profiles[0].team[0].moveIds = [1, 1, 2, 3]), /repetidos/);
    reject((s) => s.profiles[0].team.pop(), /6 Pokémon/);
    reject((s) => (s.profiles[0].team[1].speciesId = s.profiles[0].team[0].speciesId), /repetidos/);
    reject((s) => (s.profiles[0].team[0].build.level = 500), /entero entre 1 y 100/);
    reject((s) => (s.profiles[0].team[0].build.ivs.hp = 40), /entre 0 y 31/);
    reject((s) => (s.profiles[0].team[0].build.evs = { hp: 255, atk: 255, def: 255, spa: 255, spd: 0, spe: 0 }), /510/);
    reject((s) => (s.profiles[0].coins = -3), /entero/);
  });

  it('rechaza perfiles duplicados y temporadas incoherentes', () => {
    reject((s) => (s.profiles[1].id = s.profiles[0].id), /identificadores/);
    reject((s) => (s.profiles[1].name = s.profiles[0].name.toUpperCase()), /nombres/);
    reject((s) => (s.season.participants[0] = 'nadie'), /perfil desconocido/);
    reject((s) => (s.season.participants = s.season.participants.slice(0, 3)), /entre 4 y 8/);
    reject((s) => (s.season.rounds[0][0].result = { winner: 'otro', faintedA: 1, faintedB: 1, mode: 'played' }), /ganador/);
    reject((s) => (s.season.rounds[0][0].result.faintedA = 9), /entre 0 y 6/);
    reject((s) => {
      const dup = s.season.rounds[1][0];
      dup.a = s.season.rounds[0][0].a;
      dup.b = s.season.rounds[0][0].b;
      dup.result = null;
    }, /más de una vez/);
    reject((s) => s.season.byes.pop(), /jornadas/);
    reject((s) => (s.nextSeasonNumber = 7), /temporada en curso/);
  });

  it('rechaza lo que no es una partida', () => {
    expect(() => deserialize('esto no es json')).toThrow(/JSON/);
    expect(() => deserialize('[]')).toThrow(/objeto/);
    expect(() => deserialize('{}')).toThrow(/versión/);
    expect(() => validateGameState({ ...clone(emptyGame()), profiles: 'x' })).toThrow(/lista/);
  });
});

describe('guardado: versiones', () => {
  it('acepta la versión actual y rechaza versiones futuras o ausentes con un mensaje claro', () => {
    expect(() => migrate(clone(emptyGame()))).not.toThrow();
    expect(() => migrate({ ...clone(emptyGame()), version: SAVE_VERSION + 1 })).toThrow(/versión más nueva/);
    expect(() => migrate({ ...clone(emptyGame()), version: 0 })).toThrow(/versión/);
    expect(() => migrate({ profiles: [] })).toThrow(/versión/);
  });
});

describe('guardado: localStorage', () => {
  it('guarda y carga', () => {
    const store = memStore();
    const state = sampleGame();
    expect(saveGame(store, state)).toBe(true);
    expect(store.data[STORAGE_KEY]).toBeDefined();
    expect(loadGame(store)).toEqual({ state, problem: null });
  });

  it('sin partida guardada empieza vacío sin avisar', () => {
    expect(loadGame(memStore())).toEqual({ state: emptyGame(), problem: null });
    expect(loadGame(null)).toEqual({ state: emptyGame(), problem: null });
  });

  it('si la partida guardada está corrupta, avisa, guarda una copia y empieza de cero', () => {
    const store = memStore({ [STORAGE_KEY]: '{"version":1,"profiles":[{"id":"x"}]}' });
    const res = loadGame(store);
    expect(res.state).toEqual(emptyGame());
    expect(res.problem).toMatch(/no se pudo leer/);
    expect(store.data[BACKUP_KEY]).toBe('{"version":1,"profiles":[{"id":"x"}]}');
  });

  it('tolera un almacenamiento que falla', () => {
    const broken: KeyValueStore = {
      getItem: () => { throw new Error('bloqueado'); },
      setItem: () => { throw new Error('lleno'); },
      removeItem: () => undefined,
    };
    expect(loadGame(broken).problem).toMatch(/almacenamiento/);
    expect(saveGame(broken, emptyGame())).toBe(false);
    expect(saveGame(null, emptyGame())).toBe(false);
  });
});

describe('exportar e importar', () => {
  it('ida y vuelta por el fichero JSON', () => {
    const state = sampleGame(6);
    const text = exportGame(state, new Date('2026-01-02T03:04:05Z'));
    const file = JSON.parse(text);
    expect(file.format).toBe(EXPORT_FORMAT);
    expect(file.version).toBe(SAVE_VERSION);
    expect(file.exportedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(importGame(text)).toEqual(state);
  });

  it('acepta también un estado guardado sin envoltorio', () => {
    const state = sampleGame(2);
    expect(importGame(serialize(state))).toEqual(state);
  });

  it('rechaza ficheros ajenos, corruptos o de otra versión', () => {
    expect(() => importGame('no json')).toThrow(/JSON válido/);
    expect(() => importGame('{"hola":1}')).toThrow(/No parece/);
    expect(() => importGame(JSON.stringify({ format: EXPORT_FORMAT, version: 99, state: {} }))).toThrow(/versión más nueva/);
    const bad = JSON.parse(exportGame(sampleGame()));
    bad.state.profiles[0].team[0].speciesId = 99999;
    expect(() => importGame(JSON.stringify(bad))).toThrow(/Pokémon desconocido/);
  });
});
