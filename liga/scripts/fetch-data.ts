/**
 * Descarga UNA vez los datos de PokéAPI (generaciones 1-3) y los guarda como JSON en src/data.
 *
 * Usa los CSV oficiales del repositorio de PokéAPI (son exactamente los datos que sirve la API,
 * pero en pocos ficheros en lugar de ~1000 llamadas). Después el juego no necesita conexión.
 *
 * Uso:  npm run fetch-data
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');

const MAX_GEN = 3;
const ES = 7;
const EN = 9;

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

async function csv(name: string): Promise<Row[]> {
  const res = await fetch(`${BASE}${name}.csv`);
  if (!res.ok) throw new Error(`No se pudo descargar ${name}.csv (${res.status})`);
  return parseCsv(await res.text());
}

const num = (s: string | undefined): number | null => (s === undefined || s === '' ? null : Number(s));
const clean = (s: string) => s.replace(/[\n\f­]+/g, ' ').replace(/\s+/g, ' ').trim();

const TYPE_SLUGS = [
  'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel',
  'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy',
];
const STAT_BY_ID: Record<number, string> = { 1: 'hp', 2: 'atk', 3: 'def', 4: 'spa', 5: 'spd', 6: 'spe' };
/** Las mejoras de combate incluyen además precisión y evasión. */
const STAGE_BY_ID: Record<number, string> = { ...STAT_BY_ID, 7: 'acc', 8: 'eva' };
/** move_flags de PokéAPI que usa el motor. */
const FLAG_IDS = { contact: 1, charge: 2, recharge: 3, sound: 9, defrost: 11 } as const;
const CATEGORY_BY_ID: Record<number, string> = { 1: 'status', 2: 'physical', 3: 'special' };

/** language_id -> id -> texto, quedándose con la versión más reciente (para textos por version_group). */
function names(rows: Row[], idCol: string, lang: number): Map<number, string> {
  const m = new Map<number, string>();
  for (const r of rows) if (Number(r.local_language_id) === lang) m.set(Number(r[idCol]), r.name!);
  return m;
}

function latestFlavor(rows: Row[], idCol: string, lang: number): Map<number, string> {
  const best = new Map<number, { vg: number; text: string }>();
  for (const r of rows) {
    if (Number(r.language_id) !== lang) continue;
    const id = Number(r[idCol]);
    const vg = Number(r.version_group_id);
    if (!best.has(id) || best.get(id)!.vg < vg) best.set(id, { vg, text: clean(r.flavor_text!) });
  }
  return new Map([...best].map(([k, v]) => [k, v.text]));
}

async function main() {
  console.log('Descargando CSV de PokéAPI…');
  const [
    pokemon, species, speciesNames, pokemonStats, pokemonTypes, typeEfficacy, typeNames,
    moves, moveNames, moveMeta, moveMetaStats, moveFlagMap, abilities, abilityNames, abilityFlavor,
    natures, natureNames,
  ] = await Promise.all([
    csv('pokemon'), csv('pokemon_species'), csv('pokemon_species_names'), csv('pokemon_stats'),
    csv('pokemon_types'), csv('type_efficacy'), csv('type_names'),
    csv('moves'), csv('move_names'), csv('move_meta'), csv('move_meta_stat_changes'), csv('move_flag_map'),
    csv('abilities'), csv('ability_names'), csv('ability_flavor_text'),
    csv('natures'), csv('nature_names'),
  ]);

  const typeSlugById = new Map(
    (await csv('types')).map((r) => [Number(r.id), r.identifier!] as const).filter(([, s]) => TYPE_SLUGS.includes(s)),
  );

  // ---------- Especies ----------
  const esSpecies = names(speciesNames, 'pokemon_species_id', ES);
  const enSpecies = names(speciesNames, 'pokemon_species_id', EN);
  const evolvesInto = new Set(species.map((s) => num(s.evolves_from_species_id)).filter((x): x is number => x !== null));
  const defaultPokemonOf = new Map(pokemon.filter((p) => p.is_default === '1').map((p) => [Number(p.species_id), Number(p.id)] as const));

  const speciesOut = species
    .filter((s) => Number(s.generation_id) <= MAX_GEN)
    .map((s) => {
      const id = Number(s.id);
      const pid = defaultPokemonOf.get(id)!;
      const baseStats = Object.fromEntries(
        pokemonStats.filter((r) => Number(r.pokemon_id) === pid).map((r) => [STAT_BY_ID[Number(r.stat_id)], Number(r.base_stat)]),
      );
      const types = pokemonTypes
        .filter((r) => Number(r.pokemon_id) === pid)
        .sort((a, b) => Number(a.slot) - Number(b.slot))
        .map((r) => typeSlugById.get(Number(r.type_id))!);
      return {
        id,
        slug: s.identifier!,
        name: esSpecies.get(id) ?? enSpecies.get(id) ?? s.identifier!,
        generation: Number(s.generation_id),
        types,
        baseStats,
        finalStage: !evolvesInto.has(id),
        legendary: s.is_legendary === '1' || s.is_mythical === '1',
      };
    })
    .sort((a, b) => a.id - b.id);

  // ---------- Tipos ----------
  const esType = names(typeNames, 'type_id', ES);
  const enType = names(typeNames, 'type_id', EN);
  const typesOut = {
    names: Object.fromEntries([...typeSlugById].map(([id, slug]) => [slug, esType.get(id) ?? enType.get(id) ?? slug])),
    /** chart[atacante][defensor] = multiplicador (0, 0.5, 1, 2). */
    chart: Object.fromEntries(
      [...typeSlugById].map(([aid, aslug]) => [
        aslug,
        Object.fromEntries(
          typeEfficacy
            .filter((r) => Number(r.damage_type_id) === aid && typeSlugById.has(Number(r.target_type_id)))
            .map((r) => [typeSlugById.get(Number(r.target_type_id))!, Number(r.damage_factor) / 100]),
        ),
      ]),
    ),
  };

  // ---------- Ataques ----------
  const esMove = names(moveNames, 'move_id', ES);
  const enMove = names(moveNames, 'move_id', EN);
  const metaById = new Map(moveMeta.map((r) => [Number(r.move_id), r] as const));
  const statChangesById = new Map<number, { stat: string; change: number }[]>();
  for (const r of moveMetaStats) {
    const id = Number(r.move_id);
    const list = statChangesById.get(id) ?? [];
    const stat = STAGE_BY_ID[Number(r.stat_id)];
    if (stat) list.push({ stat, change: Number(r.change) });
    statChangesById.set(id, list);
  }
  const flagsById = new Map<number, Set<number>>();
  for (const r of moveFlagMap) {
    const id = Number(r.move_id);
    flagsById.set(id, (flagsById.get(id) ?? new Set()).add(Number(r.move_flag_id)));
  }
  const movesOut = moves
    .filter((m) => Number(m.generation_id) <= MAX_GEN && Number(m.id) < 10000 && typeSlugById.has(Number(m.type_id)))
    .map((m) => {
      const id = Number(m.id);
      const meta = metaById.get(id);
      return {
        id,
        slug: m.identifier!,
        name: esMove.get(id) ?? enMove.get(id) ?? m.identifier!,
        type: typeSlugById.get(Number(m.type_id))!,
        category: CATEGORY_BY_ID[Number(m.damage_class_id)]!,
        power: num(m.power),
        accuracy: num(m.accuracy),
        pp: Number(m.pp),
        priority: Number(m.priority),
        target: Number(m.target_id),
        effectId: Number(m.effect_id),
        effectChance: num(m.effect_chance),
        flags: Object.fromEntries(
          Object.entries(FLAG_IDS).map(([name, flagId]) => [name, flagsById.get(id)?.has(flagId) ?? false]),
        ),
        meta: {
          category: Number(meta?.meta_category_id ?? 0),
          ailmentId: Number(meta?.meta_ailment_id ?? 0),
          ailmentChance: Number(meta?.ailment_chance ?? 0),
          flinchChance: Number(meta?.flinch_chance ?? 0),
          statChance: Number(meta?.stat_chance ?? 0),
          critRate: Number(meta?.crit_rate ?? 0),
          drain: Number(meta?.drain ?? 0),
          healing: Number(meta?.healing ?? 0),
          minHits: num(meta?.min_hits),
          maxHits: num(meta?.max_hits),
          statChanges: statChangesById.get(id) ?? [],
        },
      };
    })
    .filter((m) => m.slug !== 'struggle')
    .sort((a, b) => a.id - b.id);

  // ---------- Habilidades ----------
  const esAbility = names(abilityNames, 'ability_id', ES);
  const enAbility = names(abilityNames, 'ability_id', EN);
  const esFlavor = latestFlavor(abilityFlavor, 'ability_id', ES);
  const enFlavor = latestFlavor(abilityFlavor, 'ability_id', EN);
  const abilitiesOut = abilities
    .filter((a) => Number(a.generation_id) <= MAX_GEN && a.is_main_series === '1')
    .map((a) => {
      const id = Number(a.id);
      return {
        id,
        slug: a.identifier!,
        name: esAbility.get(id) ?? enAbility.get(id) ?? a.identifier!,
        description: esFlavor.get(id) ?? enFlavor.get(id) ?? '',
      };
    })
    .sort((a, b) => a.id - b.id);

  // ---------- Naturalezas ----------
  const esNature = names(natureNames, 'nature_id', ES);
  const naturesOut = natures.map((n) => {
    const up = STAT_BY_ID[Number(n.increased_stat_id)]!;
    const down = STAT_BY_ID[Number(n.decreased_stat_id)]!;
    return {
      id: Number(n.id),
      slug: n.identifier!,
      name: esNature.get(Number(n.id)) ?? n.identifier!,
      up: up === down ? null : up,
      down: up === down ? null : down,
    };
  });

  await mkdir(OUT, { recursive: true });
  const write = (file: string, data: unknown) => writeFile(join(OUT, file), JSON.stringify(data));
  await Promise.all([
    write('species.json', speciesOut),
    write('moves.json', movesOut),
    write('abilities.json', abilitiesOut),
    write('types.json', typesOut),
    write('natures.json', naturesOut),
  ]);
  console.log(
    `Listo: ${speciesOut.length} especies (${speciesOut.filter((s) => s.finalStage).length} en su última etapa), ` +
      `${movesOut.length} ataques, ${abilitiesOut.length} habilidades, ${naturesOut.length} naturalezas → ${OUT}`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
