import { ABILITIES, MOVES, NATURES, SPECIES, getSpecies, isMega } from '../core/data';
import { validateDraw } from '../core/game/settings';
import {
  ALL_GENERATIONS, MAX_PLAYERS, MIN_PLAYERS, SAVE_VERSION, defaultSettings, emptyGame,
  type GameState, type Match, type Profile, type Season, type SeasonRecord, type Settings,
} from '../core/game/types';
import { STAT_KEYS, type BuildConfig, type PokemonSet, type Stats } from '../core/types';

export const STORAGE_KEY = 'pokeliga:save';
export const BACKUP_KEY = 'pokeliga:backup';
export const EXPORT_FORMAT = 'pokeliga-save';

export class SaveError extends Error {}

/** Lo mínimo que necesitamos de `localStorage` (permite probarlo con un objeto en memoria). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ---------------------------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const fail = (path: string, msg: string): never => {
  throw new SaveError(`${path}: ${msg}`);
};
const obj = (v: unknown, path: string): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : fail(path, 'se esperaba un objeto'));
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(path, 'se esperaba una lista'));
const str = (v: unknown, path: string, max = 200): string =>
  typeof v === 'string' && v.length > 0 && v.length <= max ? v : fail(path, 'se esperaba un texto no vacío');
const int = (v: unknown, path: string, min: number, max: number): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fail(path, `se esperaba un entero entre ${min} y ${max}`);
const num = (v: unknown, path: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail(path, 'se esperaba un número'));
const bool = (v: unknown, path: string): boolean => (typeof v === 'boolean' ? v : fail(path, 'se esperaba verdadero o falso'));

const SPECIES_IDS = new Set(SPECIES.map((s) => s.id));
const MOVE_IDS = new Set(MOVES.map((m) => m.id));
const ABILITY_IDS = new Set(ABILITIES.map((a) => a.id));
const NATURE_IDS = new Set(NATURES.map((n) => n.id));

function statsOf(v: unknown, path: string, max: number): Stats {
  const o = obj(v, path);
  return Object.fromEntries(STAT_KEYS.map((k) => [k, int(o[k], `${path}.${k}`, 0, max)])) as Stats;
}

function buildOf(v: unknown, path: string): BuildConfig {
  const o = obj(v, path);
  const natureId = int(o.natureId, `${path}.natureId`, 1, 100000);
  if (!NATURE_IDS.has(natureId)) fail(`${path}.natureId`, 'naturaleza desconocida');
  const evs = statsOf(o.evs, `${path}.evs`, 255);
  if (Object.values(evs).reduce((a, b) => a + b, 0) > 510) fail(`${path}.evs`, 'más de 510 EVs en total');
  return { level: int(o.level, `${path}.level`, 1, 100), ivs: statsOf(o.ivs, `${path}.ivs`, 31), evs, natureId };
}

function setOf(v: unknown, path: string): PokemonSet {
  const o = obj(v, path);
  const speciesId = int(o.speciesId, `${path}.speciesId`, 1, 100000);
  if (!SPECIES_IDS.has(speciesId)) fail(`${path}.speciesId`, `Pokémon desconocido (${speciesId})`);
  if (isMega(getSpecies(speciesId))) fail(`${path}.speciesId`, 'una megaevolución no puede estar en un equipo (solo existe en combate)');
  const abilityId = int(o.abilityId, `${path}.abilityId`, 1, 100000);
  if (!ABILITY_IDS.has(abilityId)) fail(`${path}.abilityId`, `habilidad desconocida (${abilityId})`);
  const moveIds = arr(o.moveIds, `${path}.moveIds`).map((m, i) => int(m, `${path}.moveIds[${i}]`, 1, 100000));
  if (moveIds.length !== 4) fail(`${path}.moveIds`, 'cada Pokémon lleva exactamente 4 ataques');
  if (new Set(moveIds).size !== 4) fail(`${path}.moveIds`, 'ataques repetidos');
  for (const id of moveIds) if (!MOVE_IDS.has(id)) fail(`${path}.moveIds`, `ataque desconocido (${id})`);
  return { speciesId, abilityId, moveIds, build: buildOf(o.build, `${path}.build`) };
}

function profileOf(v: unknown, path: string): Profile {
  const o = obj(v, path);
  const avatar = obj(o.avatar, `${path}.avatar`);
  const team = arr(o.team, `${path}.team`).map((s, i) => setOf(s, `${path}.team[${i}]`));
  if (team.length !== 6) fail(`${path}.team`, 'el equipo debe tener 6 Pokémon');
  if (new Set(team.map((p) => p.speciesId)).size !== 6) fail(`${path}.team`, 'Pokémon repetidos en el equipo');
  return {
    id: str(o.id, `${path}.id`, 60),
    name: str(o.name, `${path}.name`, 40),
    avatar: { emoji: str(avatar.emoji, `${path}.avatar.emoji`, 16), hue: num(avatar.hue, `${path}.avatar.hue`) },
    main: bool(o.main, `${path}.main`),
    team,
    coins: int(o.coins, `${path}.coins`, 0, 1_000_000),
  };
}

function matchOf(v: unknown, path: string, participants: Set<string>, round: number): Match {
  const o = obj(v, path);
  const a = str(o.a, `${path}.a`, 60);
  const b = str(o.b, `${path}.b`, 60);
  if (!participants.has(a) || !participants.has(b) || a === b) fail(path, 'pareja no válida');
  let result: Match['result'] = null;
  if (o.result !== null && o.result !== undefined) {
    const r = obj(o.result, `${path}.result`);
    const winner = str(r.winner, `${path}.result.winner`, 60);
    if (winner !== a && winner !== b) fail(`${path}.result.winner`, 'el ganador no participa');
    const mode = r.mode;
    if (mode !== 'played' && mode !== 'simulated') fail(`${path}.result.mode`, 'modo desconocido');
    result = {
      winner,
      faintedA: int(r.faintedA, `${path}.result.faintedA`, 0, 6),
      faintedB: int(r.faintedB, `${path}.result.faintedB`, 0, 6),
      mode: mode as 'played' | 'simulated',
    };
  }
  return { id: str(o.id, `${path}.id`, 60), round, a, b, result };
}

function seasonOf(v: unknown, path: string, profileIds: Set<string>): Season {
  const o = obj(v, path);
  const participants = arr(o.participants, `${path}.participants`).map((p, i) => str(p, `${path}.participants[${i}]`, 60));
  if (participants.length < MIN_PLAYERS || participants.length > MAX_PLAYERS) fail(`${path}.participants`, `debe haber entre ${MIN_PLAYERS} y ${MAX_PLAYERS} participantes`);
  if (new Set(participants).size !== participants.length) fail(`${path}.participants`, 'participantes repetidos');
  for (const id of participants) if (!profileIds.has(id)) fail(`${path}.participants`, `perfil desconocido (${id})`);
  const set = new Set(participants);
  const pairs = new Set<string>();
  const matchIds = new Set<string>();
  const rounds = arr(o.rounds, `${path}.rounds`).map((r, ri) =>
    arr(r, `${path}.rounds[${ri}]`).map((m, mi) => {
      const match = matchOf(m, `${path}.rounds[${ri}][${mi}]`, set, ri);
      const key = [match.a, match.b].sort().join('|');
      if (pairs.has(key)) fail(`${path}.rounds`, 'una pareja juega más de una vez');
      if (matchIds.has(match.id)) fail(`${path}.rounds`, `identificador de combate repetido (${match.id})`);
      pairs.add(key);
      matchIds.add(match.id);
      return match;
    }),
  );
  const byes = arr(o.byes, `${path}.byes`).map((b, i) => (b === null ? null : str(b, `${path}.byes[${i}]`, 60)));
  if (byes.length !== rounds.length) fail(`${path}.byes`, 'no coincide con el número de jornadas');
  return {
    number: int(o.number, `${path}.number`, 1, 100000),
    startedAt: num(o.startedAt, `${path}.startedAt`),
    participants,
    rounds,
    byes,
    finishedAt: o.finishedAt === null ? null : num(o.finishedAt, `${path}.finishedAt`),
  };
}

function recordOf(v: unknown, path: string): SeasonRecord {
  const o = obj(v, path);
  const standings = arr(o.standings, `${path}.standings`).map((r, i) => {
    const row = obj(r, `${path}.standings[${i}]`);
    return {
      profileId: str(row.profileId, `${path}.standings[${i}].profileId`, 60),
      name: str(row.name, `${path}.standings[${i}].name`, 60),
      played: int(row.played, `${path}.standings[${i}].played`, 0, 100),
      won: int(row.won, `${path}.standings[${i}].won`, 0, 100),
      lost: int(row.lost, `${path}.standings[${i}].lost`, 0, 100),
      points: int(row.points, `${path}.standings[${i}].points`, 0, 1000),
      faintedCaused: int(row.faintedCaused, `${path}.standings[${i}].faintedCaused`, 0, 1000),
      faintedSuffered: int(row.faintedSuffered, `${path}.standings[${i}].faintedSuffered`, 0, 1000),
      diff: int(row.diff, `${path}.standings[${i}].diff`, -1000, 1000),
    };
  });
  return {
    number: int(o.number, `${path}.number`, 1, 100000),
    startedAt: num(o.startedAt, `${path}.startedAt`),
    finishedAt: num(o.finishedAt, `${path}.finishedAt`),
    championId: str(o.championId, `${path}.championId`, 60),
    championName: str(o.championName, `${path}.championName`, 60),
    standings,
  };
}

function settingsOf(v: unknown, path: string): Settings {
  const o = obj(v, path);
  const draw = obj(o.draw, `${path}.draw`);
  const generations = arr(draw.generations, `${path}.draw.generations`).map((g, i) =>
    int(g, `${path}.draw.generations[${i}]`, 1, ALL_GENERATIONS.length),
  );
  const parsed = {
    generations,
    legendaries: bool(draw.legendaries, `${path}.draw.legendaries`),
    finalStageOnly: bool(draw.finalStageOnly, `${path}.draw.finalStageOnly`),
  };
  const error = validateDraw(parsed);
  if (error) fail(`${path}.draw`, error);
  return { draw: parsed };
}

/** Comprueba la estructura y los datos (Pokémon, ataques, habilidades…) y devuelve el estado limpio. */
export function validateGameState(raw: unknown): GameState {
  const o = obj(raw, 'partida');
  const profiles = arr(o.profiles, 'profiles').map((p, i) => profileOf(p, `profiles[${i}]`));
  const ids = new Set(profiles.map((p) => p.id));
  if (ids.size !== profiles.length) fail('profiles', 'identificadores de perfil repetidos');
  const names = new Set(profiles.map((p) => p.name.toLowerCase()));
  if (names.size !== profiles.length) fail('profiles', 'nombres de perfil repetidos');
  const season = o.season === null || o.season === undefined ? null : seasonOf(o.season, 'season', ids);
  const history = arr(o.history ?? [], 'history').map((r, i) => recordOf(r, `history[${i}]`));
  const nextSeasonNumber = int(o.nextSeasonNumber, 'nextSeasonNumber', 1, 100000);
  if (season && season.number !== nextSeasonNumber) fail('nextSeasonNumber', 'no coincide con la temporada en curso');
  if (history.some((r) => r.number >= nextSeasonNumber)) fail('nextSeasonNumber', 'hay temporadas del historial con número posterior');
  return { version: SAVE_VERSION, settings: settingsOf(o.settings, 'settings'), profiles, season, history, nextSeasonNumber };
}

// ---------------------------------------------------------------------------------------------
// Versiones
// ---------------------------------------------------------------------------------------------

/** migrations[n] convierte una partida de la versión n a la n+1. Se añaden aquí cuando cambie el formato. */
const MIGRATIONS: Record<number, (state: Obj) => Obj> = {
  // v1 → v2: aparecen los ajustes del sorteo. Las partidas antiguas pasan a los valores por defecto (todas las
  // generaciones); sus equipos no cambian, solo los sorteos futuros.
  1: (state) => ({ ...state, settings: defaultSettings() }),
};

export function migrate(raw: unknown): unknown {
  const o = obj(raw, 'partida');
  let version = o.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) fail('version', 'falta la versión de la partida');
  if ((version as number) > SAVE_VERSION) {
    throw new SaveError(`Esta partida es de una versión más nueva (${version}) que la de la aplicación (${SAVE_VERSION}). Actualiza la app.`);
  }
  let state: Obj = o;
  while ((version as number) < SAVE_VERSION) {
    const step = MIGRATIONS[version as number];
    if (!step) fail('version', `no se sabe migrar desde la versión ${version}`);
    state = { ...step!(state), version: (version as number) + 1 };
    version = (version as number) + 1;
  }
  return state;
}

// ---------------------------------------------------------------------------------------------
// Guardar, cargar, exportar e importar
// ---------------------------------------------------------------------------------------------

export const serialize = (state: GameState): string => JSON.stringify(state);

export function deserialize(text: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveError('El texto no es un JSON válido');
  }
  return validateGameState(migrate(raw));
}

export interface LoadResult {
  state: GameState;
  /** Mensaje si había una partida guardada pero no se pudo leer (se conserva una copia en BACKUP_KEY). */
  problem: string | null;
}

export function loadGame(store: KeyValueStore | null): LoadResult {
  if (!store) return { state: emptyGame(), problem: null };
  let text: string | null = null;
  try {
    text = store.getItem(STORAGE_KEY);
  } catch {
    return { state: emptyGame(), problem: 'No se puede acceder al almacenamiento del navegador; la partida no se guardará.' };
  }
  if (text === null) return { state: emptyGame(), problem: null };
  try {
    return { state: deserialize(text), problem: null };
  } catch (e) {
    try {
      store.setItem(BACKUP_KEY, text);
    } catch {
      /* sin copia */
    }
    return { state: emptyGame(), problem: `La partida guardada no se pudo leer (${(e as Error).message}). Se guardó una copia aparte y se empieza de cero.` };
  }
}

/** Devuelve true si se guardó. */
export function saveGame(store: KeyValueStore | null, state: GameState): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  state: GameState;
}

export const exportGame = (state: GameState, now = new Date()): string =>
  JSON.stringify({ format: EXPORT_FORMAT, version: SAVE_VERSION, exportedAt: now.toISOString(), state } satisfies ExportFile, null, 2);

/** Lee un fichero exportado (o directamente un estado guardado). */
export function importGame(text: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SaveError('El fichero no es un JSON válido');
  }
  const o = obj(raw, 'fichero');
  if (o.format === EXPORT_FORMAT) {
    if (typeof o.version === 'number' && o.version > SAVE_VERSION) {
      throw new SaveError(`El fichero es de una versión más nueva (${o.version}) que la de la aplicación (${SAVE_VERSION}).`);
    }
    return validateGameState(migrate({ ...obj(o.state, 'state'), version: o.version }));
  }
  if ('profiles' in o) return validateGameState(migrate(o));
  throw new SaveError('No parece un fichero de partida de la Liga Pokémon');
}

/** `localStorage` si está disponible (puede fallar en modo privado o con datos bloqueados). */
export function browserStore(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = '__pokeliga_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
