import { describe, expect, it } from 'vitest';
import { chooseAction, chooseReplacement } from '../src/core/ai';
import { executeTurn, legalMoveSlots, sendOut, startBattle } from '../src/core/battle/engine';
import { simulateBattle, MAX_SIM_TURNS } from '../src/core/battle/sim';
import { activeOf, createBattle, SIDES, type Battle } from '../src/core/battle/state';
import { ABILITIES, MOVES } from '../src/core/data';
import { rollTeam } from '../src/core/generator';
import { createRng } from '../src/core/rng';
import { abilityId, makeSet } from './helpers';

/** Comprobaciones baratas (un `throw` en vez de `expect`) para poder ejecutarlas en cada turno. */
function checkInvariants(b: Battle): void {
  const fail = (msg: string): never => {
    throw new Error(`Invariante rota: ${msg}`);
  };
  for (const side of SIDES) {
    for (const p of b.sides[side].team) {
      if (!Number.isInteger(p.hp) || p.hp < 0 || p.hp > p.maxHp) fail(`PS de ${p.name}: ${p.hp}/${p.maxHp}`);
      for (const [k, v] of Object.entries(p.stages)) if (Math.abs(v) > 6) fail(`${k} de ${p.name}: ${v}`);
      for (const m of p.moves) if (m.pp < 0) fail(`PP de ${p.name}: ${m.pp}`);
    }
  }
}

describe('combates 6 contra 6 completos (IA contra IA)', () => {
  it('siempre terminan con un ganador coherente', () => {
    let capped = 0;
    let totalTurns = 0;
    const N = 150;
    for (let seed = 1; seed <= N; seed++) {
      const rng = createRng(seed);
      const battle = createBattle(rollTeam(rng), rollTeam(rng));
      startBattle(battle, rng);
      let guard = 0;
      while (battle.winner === null) {
        for (const side of SIDES) if (battle.pending[side]) sendOut(battle, side, chooseReplacement(battle, side), rng);
        if (battle.winner !== null) break;
        executeTurn(battle, [chooseAction(battle, 0, rng), chooseAction(battle, 1, rng)], rng);
        checkInvariants(battle);
        if (++guard > MAX_SIM_TURNS) { capped++; break; }
      }
      totalTurns += battle.turn;
      if (battle.winner !== null) {
        const loser = battle.winner === 0 ? 1 : 0;
        expect(battle.sides[loser].team.every((p) => p.hp === 0)).toBe(true);
        expect(battle.pending).toEqual([false, false]);
      }
    }
    expect(capped / N).toBeLessThan(0.05);
    expect(totalTurns / N).toBeGreaterThan(5);
  });

  it('simulateBattle devuelve siempre un ganador', () => {
    for (let seed = 500; seed < 540; seed++) {
      const rng = createRng(seed);
      const b = createBattle(rollTeam(rng), rollTeam(rng));
      const { winner } = simulateBattle(b, rng);
      expect([0, 1]).toContain(winner);
    }
  });
});

describe('pruebas de humo con todos los ataques y habilidades', () => {
  it('cada uno de los ataques se puede usar varios turnos sin errores', () => {
    for (const move of MOVES) {
      const rng = createRng(move.id);
      const b = createBattle(
        [makeSet('snorlax', [move.slug, 'tackle', 'recover', 'swords-dance'])],
        [makeSet('blissey', ['tackle', 'thunder-wave', 'toxic', 'recover'])],
      );
      startBattle(b, rng);
      for (let t = 0; t < 4 && b.winner === null; t++) {
        const mine = activeOf(b, 0);
        const slot = mine.recharging ? 0 : mine.charging !== null ? mine.charging : legalMoveSlots(mine).includes(0) ? 0 : legalMoveSlots(mine)[0]!;
        executeTurn(b, [{ type: 'move', slot }, chooseAction(b, 1, rng)], rng);
        checkInvariants(b);
      }
    }
  });

  it('cada habilidad funciona en el campo (en el activo, en ambos bandos) sin errores', () => {
    for (const ability of ABILITIES) {
      const rng = createRng(ability.id);
      const mk = (species: string) =>
        makeSet(species, ['tackle', 'flamethrower', 'thunderbolt', 'surf'], abilityId(ability.slug));
      const b = createBattle([mk('alakazam'), mk('snorlax')], [mk('gengar'), mk('charizard')]);
      for (const side of SIDES) b.sides[side].team.forEach((p) => (p.status = null));
      startBattle(b, rng);
      for (let t = 0; t < 12 && b.winner === null; t++) {
        for (const side of SIDES) if (b.pending[side]) sendOut(b, side, chooseReplacement(b, side), rng);
        if (b.winner !== null) break;
        executeTurn(b, [chooseAction(b, 0, rng), chooseAction(b, 1, rng)], rng);
        checkInvariants(b);
      }
    }
  });
});
