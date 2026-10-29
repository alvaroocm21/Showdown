import type { Rng } from '../rng';
import { MAX_PLAYERS, MIN_PLAYERS } from './types';

export interface Fixture {
  a: string;
  b: string;
}

export interface RoundRobin {
  rounds: Fixture[][];
  /** Quién descansa en cada jornada (null si nadie). */
  byes: (string | null)[];
}

/**
 * Calendario de ida (todos contra todos) con el método del círculo: cada pareja juega una vez, cada
 * perfil juega como mucho una vez por jornada y, con número impar, uno descansa en cada jornada.
 */
export function roundRobin(ids: readonly string[], rng: Rng): RoundRobin {
  if (new Set(ids).size !== ids.length) throw new Error('Hay perfiles repetidos');
  if (ids.length < MIN_PLAYERS || ids.length > MAX_PLAYERS) {
    throw new Error(`Una liga necesita entre ${MIN_PLAYERS} y ${MAX_PLAYERS} perfiles (hay ${ids.length})`);
  }
  const slots: (string | null)[] = rng.shuffle(ids);
  if (slots.length % 2 === 1) slots.push(null);
  const n = slots.length;
  const rounds: Fixture[][] = [];
  const byes: (string | null)[] = [];

  for (let r = 0; r < n - 1; r++) {
    const fixtures: Fixture[] = [];
    let bye: string | null = null;
    for (let i = 0; i < n / 2; i++) {
      const x = slots[i]!;
      const y = slots[n - 1 - i]!;
      if (x === null) bye = y;
      else if (y === null) bye = x;
      else {
        // alterna quién figura primero para repartir local/visitante
        fixtures.push((r + i) % 2 === 0 ? { a: x, b: y } : { a: y, b: x });
      }
    }
    rounds.push(fixtures);
    byes.push(bye);
    // rotación: el primero se queda fijo y los demás giran
    slots.splice(1, 0, slots.pop()!);
  }
  return { rounds, byes };
}
