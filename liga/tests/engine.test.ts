import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/core/ai';
import { executeTurn, legalMoveSlots, type BattleEvent } from '../src/core/battle/engine';
import { describeEvent } from '../src/core/battle/log';
import { activeOf, createBattle } from '../src/core/battle/state';
import { rollTeam } from '../src/core/generator';
import { createRng } from '../src/core/rng';
import { HIT_NO_CRIT_MAX, makeSet, scriptedRng } from './helpers';

const kinds = (events: BattleEvent[]) => events.map((e) => e.type);

describe('engine: un turno', () => {
  it('actúa primero el más rápido', () => {
    const b = createBattle([makeSet('jolteon', ['thunderbolt'])], [makeSet('blissey', ['tackle'])]);
    const ev = executeTurn(b, [{ type: 'move', slot: 0 }, { type: 'move', slot: 0 }], scriptedRng([...HIT_NO_CRIT_MAX, ...HIT_NO_CRIT_MAX]));
    const first = ev.find((e) => e.type === 'move');
    expect(first).toMatchObject({ side: 0, move: 'Rayo' });
  });

  it('un ataque con prioridad va antes que uno más rápido', () => {
    const b = createBattle([makeSet('snorlax', ['quick-attack'])], [makeSet('jolteon', ['thunderbolt'])]);
    const ev = executeTurn(b, [{ type: 'move', slot: 0 }, { type: 'move', slot: 0 }], scriptedRng([...HIT_NO_CRIT_MAX, ...HIT_NO_CRIT_MAX]));
    expect(ev.find((e) => e.type === 'move')).toMatchObject({ side: 0 });
  });

  it('resta 1 PP al ataque usado', () => {
    const b = createBattle([makeSet('jolteon', ['thunderbolt', 'tackle'])], [makeSet('blissey', ['tackle'])]);
    const pp = activeOf(b, 0).moves[0]!.maxPp;
    executeTurn(b, [{ type: 'move', slot: 0 }, { type: 'move', slot: 0 }], scriptedRng([...HIT_NO_CRIT_MAX, ...HIT_NO_CRIT_MAX]));
    expect(activeOf(b, 0).moves[0]!.pp).toBe(pp - 1);
    expect(activeOf(b, 0).moves[1]!.pp).toBe(activeOf(b, 0).moves[1]!.maxPp);
  });

  it('aplica el daño esperado (STAB + crítico fijo) y lo registra', () => {
    // Jolteon (spa 120 nv50) Rayo (90, eléctrico, STAB) contra Gyarados (agua/volador): ×4
    const b = createBattle([makeSet('jolteon', ['thunderbolt'])], [makeSet('gyarados', ['tackle'])]);
    const hp = activeOf(b, 1).hp;
    const ev = executeTurn(b, [{ type: 'move', slot: 0 }, { type: 'move', slot: 0 }], scriptedRng(HIT_NO_CRIT_MAX));
    const dmg = ev.find((e) => e.type === 'damage' && e.side === 1);
    expect(dmg).toBeDefined();
    expect(activeOf(b, 1).hp).toBe(hp - (dmg as { amount: number }).amount);
    expect(ev.some((e) => e.type === 'effectiveness' && e.multiplier === 4)).toBe(true);
    expect(describeEvent(ev.find((e) => e.type === 'move')!)).toBe('Jolteon usó Rayo.');
    expect(describeEvent({ type: 'effectiveness', multiplier: 4 })).toBe('¡Es muy eficaz!');
  });

  it('un ataque puede fallar según su precisión', () => {
    const b = createBattle([makeSet('jolteon', ['thunder'])], [makeSet('blissey', ['tackle'])]);
    const hp = activeOf(b, 1).hp;
    const ev = executeTurn(b, [{ type: 'move', slot: 0 }, { type: 'move', slot: 0 }], scriptedRng([0.99, 0.99, 0, 0.99]));
    expect(kinds(ev)).toContain('miss');
    expect(activeOf(b, 1).hp).toBe(hp);
  });

  it('inmunidad por tipo: no hay daño', () => {
    const b = createBattle([makeSet('jolteon', ['thunderbolt'])], [makeSet('swampert', ['tackle'])]);
    const hp = activeOf(b, 1).hp;
    const ev = executeTurn(b, [{ type: 'move', slot: 0 }, { type: 'move', slot: 0 }], scriptedRng(HIT_NO_CRIT_MAX));
    expect(kinds(ev)).toContain('immune');
    expect(activeOf(b, 1).hp).toBe(hp);
    expect(describeEvent(ev.find((e) => e.type === 'immune')!, 0)).toBe('No afecta a Swampert rival…');
  });

  it('un ataque sin efecto implementado no hace nada', () => {
    const b = createBattle([makeSet('jolteon', ['light-screen', 'tackle'])], [makeSet('blissey', ['tackle'])]);
    const ev = executeTurn(b, [{ type: 'move', slot: 0 }, { type: 'move', slot: 0 }], scriptedRng(HIT_NO_CRIT_MAX));
    expect(kinds(ev)).toContain('noEffect');
  });

  it('el daño nunca baja de 0 PS y al debilitarse acaba el combate', () => {
    const b = createBattle([makeSet('jolteon', ['thunderbolt'])], [makeSet('gyarados', ['tackle'])]);
    activeOf(b, 1).hp = 1;
    const ev = executeTurn(b, [{ type: 'move', slot: 0 }, { type: 'move', slot: 0 }], scriptedRng(HIT_NO_CRIT_MAX));
    expect(activeOf(b, 1).hp).toBe(0);
    expect(kinds(ev)).toEqual(expect.arrayContaining(['faint', 'win']));
    expect(b.winner).toBe(0);
    // el Pokémon debilitado no llega a atacar
    expect(ev.filter((e) => e.type === 'move')).toHaveLength(1);
    expect(() => executeTurn(b, [{ type: 'move', slot: 0 }, { type: 'move', slot: 0 }], scriptedRng([]))).toThrow();
  });

  it('rechaza un ataque sin PP o inexistente', () => {
    const b = createBattle([makeSet('jolteon', ['thunderbolt'])], [makeSet('blissey', ['tackle'])]);
    activeOf(b, 0).moves[0]!.pp = 0;
    expect(legalMoveSlots(activeOf(b, 0))).toEqual([-1]);
    expect(() => executeTurn(b, [{ type: 'move', slot: 0 }, { type: 'move', slot: 0 }], scriptedRng([]))).toThrow();
  });
});

describe('Forcejeo', () => {
  it('se usa sin PP: daño sin tipo y retroceso de 1/4 de los PS máximos', () => {
    const b = createBattle([makeSet('jolteon', ['thunderbolt'])], [makeSet('blissey', ['tackle'])]);
    const me = activeOf(b, 0);
    me.moves[0]!.pp = 0;
    const ev = executeTurn(b, [{ type: 'move', slot: -1 }, { type: 'move', slot: 0 }], scriptedRng([...HIT_NO_CRIT_MAX, ...HIT_NO_CRIT_MAX]));
    expect(ev.find((e) => e.type === 'move' && e.side === 0)).toMatchObject({ move: 'Forcejeo' });
    const recoil = ev.find((e) => e.type === 'damage' && e.cause === 'recoil');
    expect(recoil).toMatchObject({ side: 0, amount: Math.floor(me.maxHp / 4) });
  });
});

describe('IA', () => {
  it('prefiere el ataque superefectivo', () => {
    const b = createBattle([makeSet('venusaur', ['tackle'])], [makeSet('charizard', ['water-gun', 'flamethrower', 'tackle'])]);
    for (let seed = 1; seed <= 50; seed++) {
      expect(chooseAction(b, 1, createRng(seed))).toMatchObject({ type: 'move', slot: 1 });
    }
  });

  it('no pierde el turno con un ataque sin efecto implementado si hay otro de daño', () => {
    const b = createBattle([makeSet('venusaur', ['tackle'])], [makeSet('charizard', ['light-screen', 'protect', 'tackle'])]);
    expect(chooseAction(b, 1, createRng(3))).toMatchObject({ type: 'move', slot: 2 });
  });

  it('no elige ataques sin PP y recurre a Forcejeo', () => {
    const b = createBattle([makeSet('venusaur', ['tackle'])], [makeSet('charizard', ['flamethrower'])]);
    activeOf(b, 1).moves[0]!.pp = 0;
    expect(chooseAction(b, 1, createRng(1))).toMatchObject({ type: 'move', slot: -1 });
  });
});

describe('combates completos (IA contra IA)', () => {
  it('siempre terminan, con un ganador y sin PS negativos', () => {
    let draws = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed);
      const a = rollTeam(rng)[0]!;
      const c = rollTeam(rng)[0]!;
      const b = createBattle([a], [c]);
      let turns = 0;
      while (b.winner === null) {
        executeTurn(b, [chooseAction(b, 0, rng), chooseAction(b, 1, rng)], rng);
        for (const s of [0, 1] as const) {
          const hp = activeOf(b, s).hp;
          expect(hp).toBeGreaterThanOrEqual(0);
          expect(hp).toBeLessThanOrEqual(activeOf(b, s).maxHp);
        }
        if (++turns > 400) throw new Error(`el combate con semilla ${seed} no termina`);
      }
      const loser = b.winner === 0 ? 1 : 0;
      expect(activeOf(b, loser).hp).toBe(0);
      if (activeOf(b, b.winner).hp === 0) draws++;
    }
    expect(draws).toBeLessThan(20); // victorias "a la vez" por retroceso: casos raros
  });
});
