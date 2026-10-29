import { rollTeam, type GenerateOptions } from '../generator';
import type { Rng } from '../rng';
import type { Avatar, Profile } from './types';

export const MAX_NAME_LENGTH = 18;

const EMOJIS = ['🔥', '💧', '🌿', '⚡', '❄️', '🥊', '☠️', '🌋', '🕊️', '🔮', '🐛', '🪨', '👻', '🐉', '🌑', '⚙️', '✨', '🦊', '🐺', '🦅'];

/** Error de validación del nombre (null si es válido). */
export function validateName(name: string, existing: readonly Profile[], ignoreId?: string): string | null {
  const clean = name.trim();
  if (!clean) return 'Escribe un nombre';
  if (clean.length > MAX_NAME_LENGTH) return `Máximo ${MAX_NAME_LENGTH} caracteres`;
  const taken = existing.some((p) => p.id !== ignoreId && p.name.trim().toLowerCase() === clean.toLowerCase());
  return taken ? 'Ya existe un perfil con ese nombre' : null;
}

function pickAvatar(existing: readonly Profile[], rng: Rng): Avatar {
  const used = new Set(existing.map((p) => p.avatar.emoji));
  const free = EMOJIS.filter((e) => !used.has(e));
  const emoji = rng.pick(free.length ? free : EMOJIS);
  return { emoji, hue: (existing.length * 47 + rng.int(0, 40)) % 360 };
}

export const newProfileId = (rng: Rng) => `p${Date.now().toString(36)}${rng.int(0, 0xffff).toString(36)}`;

/** Perfil nuevo con un equipo de 6 Pokémon aleatorios. */
export function createProfile(
  name: string,
  rng: Rng,
  existing: readonly Profile[],
  opts: { main?: boolean; generate?: GenerateOptions } = {},
): Profile {
  const error = validateName(name, existing);
  if (error) throw new Error(error);
  return {
    id: newProfileId(rng),
    name: name.trim(),
    avatar: pickAvatar(existing, rng),
    main: opts.main ?? false,
    team: rollTeam(rng, opts.generate),
    coins: 0,
  };
}

/** Mueve un Pokémon del equipo una posición hacia delante (el primero es el que sale al combate). */
export function moveTeamMember(profile: Profile, index: number, delta: -1 | 1): Profile {
  const target = index + delta;
  if (target < 0 || target >= profile.team.length) return profile;
  const team = [...profile.team];
  [team[index], team[target]] = [team[target]!, team[index]!];
  return { ...profile, team };
}
