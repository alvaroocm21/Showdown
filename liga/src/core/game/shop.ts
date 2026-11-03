import { ABILITIES, DRAWABLE_MOVES as MOVES, getAbility, getMove, getSpecies } from '../data';
import { buildSet, isPlayableMoveset, rollSpecies } from '../generator';
import type { Rng } from '../rng';
import type { PokemonSet } from '../types';
import { UPGRADE_COSTS, type UpgradeKind } from './economy';
import { drawOptionsOf } from './settings';
import type { GameState, Profile } from './types';

/** Una mejora que se compra con monedas: re-sortear un ataque, la habilidad o el Pokémon entero. */
export type Upgrade =
  | { kind: 'move'; pokemon: number; slot: number }
  | { kind: 'ability'; pokemon: number }
  | { kind: 'pokemon'; pokemon: number };

export interface UpgradeResult {
  state: GameState;
  kind: UpgradeKind;
  pokemon: number;
  cost: number;
  /** Texto de lo que había y de lo que hay ahora (nombre de ataque, de habilidad o de Pokémon). */
  before: string;
  after: string;
  /** Posición del ataque cambiado (solo en `move`). */
  slot?: number;
}

export const upgradeCost = (u: Upgrade | UpgradeKind): number => UPGRADE_COSTS[typeof u === 'string' ? u : u.kind];

function replaceMove(set: PokemonSet, slot: number, rng: Rng): PokemonSet {
  const species = getSpecies(set.speciesId);
  const current = new Set(set.moveIds);
  const options = rng.shuffle(MOVES.filter((m) => !current.has(m.id)));
  for (const candidate of options) {
    const moveIds = set.moveIds.map((id, i) => (i === slot ? candidate.id : id));
    // el set debe seguir siendo jugable (≥ 2 ataques de daño y, si se puede, uno del tipo del Pokémon)
    if (isPlayableMoveset(species, moveIds)) return { ...set, moveIds };
  }
  throw new Error('No hay ningún ataque que deje el equipo jugable');
}

/**
 * Compra una mejora para un Pokémon del equipo de un perfil: descuenta las monedas y re-sortea al azar.
 * Lanza un Error con un mensaje claro si no se puede (monedas, posiciones).
 */
export function applyUpgrade(state: GameState, profileId: string, upgrade: Upgrade, rng: Rng): UpgradeResult {
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error('Perfil desconocido');
  const set = profile.team[upgrade.pokemon];
  if (!set) throw new Error('Pokémon desconocido');
  const cost = upgradeCost(upgrade);
  if (profile.coins < cost) throw new Error(`Faltan monedas: cuesta ${cost} y tienes ${profile.coins}`);

  let next: PokemonSet;
  let before: string;
  let after: string;
  let slot: number | undefined;
  switch (upgrade.kind) {
    case 'move': {
      if (!Number.isInteger(upgrade.slot) || upgrade.slot < 0 || upgrade.slot >= set.moveIds.length) throw new Error('Ataque desconocido');
      next = replaceMove(set, upgrade.slot, rng);
      before = getMove(set.moveIds[upgrade.slot]!).name;
      after = getMove(next.moveIds[upgrade.slot]!).name;
      slot = upgrade.slot;
      break;
    }
    case 'ability': {
      const options = ABILITIES.filter((a) => a.id !== set.abilityId);
      next = { ...set, abilityId: rng.pick(options).id };
      before = getAbility(set.abilityId).name;
      after = getAbility(next.abilityId).name;
      break;
    }
    case 'pokemon': {
      const taken = new Set(profile.team.map((s) => s.speciesId));
      const species = rollSpecies(rng, taken, drawOptionsOf(state));
      next = buildSet(species.id, rng, { build: set.build });
      before = getSpecies(set.speciesId).name;
      after = species.name;
      break;
    }
  }

  const updated: Profile = {
    ...profile,
    coins: profile.coins - cost,
    team: profile.team.map((s, i) => (i === upgrade.pokemon ? next : s)),
  };
  return {
    state: { ...state, profiles: state.profiles.map((p) => (p.id === profileId ? updated : p)) },
    kind: upgrade.kind,
    pokemon: upgrade.pokemon,
    cost,
    before,
    after,
    slot,
  };
}
