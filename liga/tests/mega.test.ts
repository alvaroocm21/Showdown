import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/core/ai';
import { executeTurn, megaOptions, startBattle } from '../src/core/battle/engine';
import { describeEvent } from '../src/core/battle/log';
import { simulateBattle } from '../src/core/battle/sim';
import { activeOf, createBattle } from '../src/core/battle/state';
import { SPECIES, getSpecies } from '../src/core/data';
import { computeStats, DEFAULT_BUILD } from '../src/core/stats';
import { createRng } from '../src/core/rng';
import { A, B, duel, has, makeSet, mv, scriptedRng, sw, turn, types } from './helpers';

const NOOP = 'light-screen';
const id = (slug: string) => SPECIES.find((s) => s.slug === slug)!.id;

describe('megaevolución', () => {
  it('solo pueden megaevolucionar los Pokémon que tienen megaforma (y a la forma que les toca)', () => {
    const b = duel(['charizard', [NOOP]], ['pikachu', [NOOP]]);
    expect(megaOptions(b, 0).map((m) => m.slug)).toEqual(['charizard-mega-x', 'charizard-mega-y']);
    expect(megaOptions(b, 1)).toEqual([]);
    expect(megaOptions(duel(['venusaur', [NOOP]], ['pikachu', [NOOP]]), 0).map((m) => m.slug)).toEqual(['venusaur-mega']);
  });

  it('cambia el nombre, los tipos, las estadísticas y avisa; conserva la habilidad y los PS perdidos', () => {
    const b = duel(['charizard', ['flamethrower'], 'blaze'], ['blissey', [NOOP]]);
    const before = { ...A(b).stats };
    const ability = A(b).abilityId;
    A(b).hp = 100;
    const ev = turn(b, { type: 'move', slot: 0, mega: id('charizard-mega-x') }, mv(0), [0, 0.99, 0.99]);
    expect(A(b).name).toBe('Mega-Charizard X');
    expect(A(b).types).toEqual(['fire', 'dragon']);
    expect(A(b).mega).toBe(true);
    expect(A(b).speciesId).toBe(id('charizard-mega-x'));
    expect(A(b).stats).toEqual(computeStats(id('charizard-mega-x'), DEFAULT_BUILD));
    expect(A(b).stats.atk).toBeGreaterThan(before.atk);
    expect(A(b).stats.hp).toBe(before.hp);
    expect(A(b).abilityId).toBe(ability);
    expect(A(b).hp).toBe(100);
    const mega = ev.find((e) => e.type === 'mega');
    expect(mega).toMatchObject({ side: 0, speciesId: id('charizard-mega-x'), name: 'Mega-Charizard X' });
    expect(describeEvent(mega!, 0)).toBe('¡Mega-Charizard X ha megaevolucionado!');
    // la megaevolución ocurre antes del ataque
    expect(types(ev).indexOf('mega')).toBeLessThan(types(ev).indexOf('move'));
  });

  it('si cambian los PS máximos (Mega-Zygarde) se conservan los PS perdidos', () => {
    const b = duel(['zygarde', [NOOP]], ['blissey', [NOOP]]);
    const oldMax = A(b).maxHp;
    A(b).hp = oldMax - 30;
    turn(b, { type: 'move', slot: 0, mega: id('zygarde-mega') }, mv(0));
    expect(A(b).maxHp).toBeGreaterThan(oldMax);
    expect(A(b).maxHp - A(b).hp).toBe(30);
  });

  it('solo una vez por combate y bando; el rival puede hacer la suya', () => {
    const b = createBattle([makeSet('charizard', [NOOP]), makeSet('venusaur', [NOOP])], [makeSet('blastoise', [NOOP])]);
    turn(b, { type: 'move', slot: 0, mega: id('charizard-mega-x') }, { type: 'move', slot: 0, mega: id('blastoise-mega') });
    expect([b.sides[0].megaUsed, b.sides[1].megaUsed]).toEqual([true, true]);
    turn(b, sw(1), mv(0));
    expect(megaOptions(b, 0)).toEqual([]); // ya la gastó, aunque otro Pokémon tenga megaforma
    expect(() => turn(b, { type: 'move', slot: 0, mega: id('venusaur-mega') }, mv(0))).toThrow(/no puede megaevolucionar/);
  });

  it('rechaza megaevolucionar a una forma que no le corresponde o a quien no tiene', () => {
    const b = duel(['charizard', [NOOP]], ['pikachu', [NOOP]]);
    expect(() => turn(b, { type: 'move', slot: 0, mega: id('venusaur-mega') }, mv(0))).toThrow(/no puede megaevolucionar/);
    expect(() => turn(b, mv(0), { type: 'move', slot: 0, mega: id('charizard-mega-x') })).toThrow(/no puede megaevolucionar/);
  });

  it('sigue siendo mega al retirarse y volver, con sus tipos', () => {
    const b = createBattle([makeSet('charizard', [NOOP]), makeSet('blissey', [NOOP])], [makeSet('snorlax', [NOOP])]);
    turn(b, { type: 'move', slot: 0, mega: id('charizard-mega-y') }, mv(0));
    turn(b, sw(1), mv(0));
    turn(b, sw(0), mv(0));
    expect(A(b).mega).toBe(true);
    expect(A(b).name).toBe('Mega-Charizard Y');
    expect(A(b).types).toEqual(['fire', 'flying']);
  });

  it('la velocidad nueva cuenta para el orden del mismo turno', () => {
    // Alakazam (120) es más lento que Jolteon (130); Mega-Alakazam (150) es más rápido
    const slow = duel(['alakazam', ['psychic']], ['jolteon', ['thunderbolt']]);
    expect(turn(slow, mv(0), mv(0), [0, 0.99, 0.99, 0, 0.99, 0.99]).find((e) => e.type === 'move')).toMatchObject({ side: 1 });
    const fast = duel(['alakazam', ['psychic']], ['jolteon', ['thunderbolt']]);
    const ev = turn(fast, { type: 'move', slot: 0, mega: id('alakazam-mega') }, mv(0), [0, 0.99, 0.99, 0, 0.99, 0.99]);
    expect(ev.find((e) => e.type === 'move')).toMatchObject({ side: 0 });
  });

  it('no puede megaevolucionar un Pokémon transformado', () => {
    const b = duel(['venusaur', [NOOP], 'imposter'], ['pikachu', [NOOP]]);
    startBattle(b, scriptedRng([]));
    expect(megaOptions(b, 0)).toEqual([]);
  });

  it('la IA megaevoluciona en cuanto puede y solo una vez por combate', () => {
    const b = duel(['charizard', ['flamethrower']], ['blastoise', ['surf']]);
    const action = chooseAction(b, 0, createRng(1));
    expect(action).toMatchObject({ type: 'move', mega: expect.any(Number) });
    expect(getSpecies((action as { mega: number }).mega).form?.kind).toBe('mega');
    expect(chooseAction(b, 1, createRng(1))).toMatchObject({ mega: id('blastoise-mega') });
  });

  it('en combates completos IA contra IA cada bando megaevoluciona como mucho una vez', () => {
    const mega = ['charizard', 'venusaur', 'blastoise', 'gengar', 'alakazam', 'gyarados'];
    let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createRng(seed);
      const team = () => mega.map((s) => makeSet(s, ['tackle', 'flamethrower', 'surf', 'psychic']));
      const b = createBattle(team(), team());
      const events = [...startBattle(b, rng)];
      // misma lógica que simulateBattle, pero conservando los eventos
      while (b.winner === null && b.turn < 150) {
        for (const side of [0, 1] as const) {
          if (b.pending[side]) continue;
        }
        if (b.pending[0] || b.pending[1]) break;
        events.push(...executeTurn(b, [chooseAction(b, 0, rng), chooseAction(b, 1, rng)], rng));
        if (b.pending[0] || b.pending[1]) break;
      }
      for (const side of [0, 1] as const) expect(events.filter((e) => e.type === 'mega' && e.side === side).length).toBeLessThanOrEqual(1);
      total += events.filter((e) => e.type === 'mega').length;
    }
    expect(total).toBeGreaterThan(30);
    void simulateBattle;
  });
});

void B; void has; void activeOf;
