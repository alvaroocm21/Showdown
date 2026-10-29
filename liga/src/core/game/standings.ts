import { WIN_POINTS, type Season, type StandingRow } from './types';

/**
 * Clasificación: 3 puntos por victoria, 0 por derrota. Desempate por diferencia de Pokémon debilitados,
 * luego por Pokémon rivales debilitados y por último por nombre (o id).
 */
export function computeStandings(season: Season, names: ReadonlyMap<string, string> = new Map()): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    season.participants.map((id) => [id, { profileId: id, played: 0, won: 0, lost: 0, points: 0, faintedCaused: 0, faintedSuffered: 0, diff: 0 }]),
  );
  for (const round of season.rounds) {
    for (const m of round) {
      if (!m.result) continue;
      const a = rows.get(m.a)!;
      const b = rows.get(m.b)!;
      a.played++;
      b.played++;
      a.faintedSuffered += m.result.faintedA;
      a.faintedCaused += m.result.faintedB;
      b.faintedSuffered += m.result.faintedB;
      b.faintedCaused += m.result.faintedA;
      const [winner, loser] = m.result.winner === m.a ? [a, b] : [b, a];
      winner.won++;
      winner.points += WIN_POINTS;
      loser.lost++;
    }
  }
  const nameOf = (id: string) => names.get(id) ?? id;
  return [...rows.values()]
    .map((r) => ({ ...r, diff: r.faintedCaused - r.faintedSuffered }))
    .sort(
      (x, y) =>
        y.points - x.points ||
        y.diff - x.diff ||
        y.faintedCaused - x.faintedCaused ||
        nameOf(x.profileId).localeCompare(nameOf(y.profileId), 'es'),
    );
}
