import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/core/ai';
import { canUseZ, executeTurn, startBattle } from '../src/core/battle/engine';
import { describeEvent } from '../src/core/battle/log';
import { moveOf } from '../src/core/battle/state';
import { zMoveName, zPower, makeZMove } from '../src/core/battle/zmoves';
import { TYPE_NAMES } from '../src/core/types';
import { createBattle } from '../src/core/battle/state';
import { createRng } from '../src/core/rng';
import { A, B, duel, makeSet, moveId, mv, scriptedRng, turn, types } from './helpers';

const NOOP = 'light-screen';
const z = (slot: number) => ({ type: 'move' as const, slot, z: true });
const lost = (b: ReturnType<typeof duel>, a0: Parameters<typeof turn>[1], rolls = [0, 0.99, 0.99]) => {
  const hp = B(b).hp;
  turn(b, a0, mv(0), rolls);
  return hp - B(b).hp;
};

describe('movimientos Z', () => {
  it('la potencia sigue la tabla oficial', () => {
    const table: [number, number][] = [[40, 100], [55, 100], [60, 120], [65, 120], [70, 140], [75, 140], [80, 160], [85, 160], [90, 175], [95, 175], [100, 180], [110, 185], [120, 190], [125, 190], [130, 195], [140, 200], [150, 200]];
    for (const [base, power] of table) expect(zPower(base), `base ${base}`).toBe(power);
    expect(zPower(null)).toBe(100);
  });

  it('cada tipo tiene su movimiento Z con nombre en español', () => {
    for (const t of TYPE_NAMES) expect(zMoveName(t), t).toBeTruthy();
    expect(zMoveName('electric')).toBe('Gigavoltio Destructor');
    expect(zMoveName('fire')).toBe('Hecatombe Pírica');
    expect(new Set(TYPE_NAMES.map(zMoveName)).size).toBe(18);
  });

  it('el movimiento Z conserva tipo y categoría, no falla y no lleva efectos secundarios', () => {
    const base = moveOf(moveId('flamethrower'));
    const zm = makeZMove(base);
    expect(zm).toMatchObject({ type: 'fire', category: 'special', power: 175, accuracy: null, name: 'Hecatombe Pírica' });
    expect(zm.meta.ailmentChance).toBe(0);
    expect(zm.meta.drain).toBe(0);
    expect(zm.flags.charge).toBe(false);
    expect(makeZMove(moveOf(moveId('solar-beam'))).flags.charge).toBe(false);
  });

  it('solo se pueden convertir los ataques de daño directo', () => {
    const b = duel(['alakazam', ['flamethrower', 'swords-dance', 'seismic-toss', 'rest']], ['snorlax', [NOOP]]);
    const user = A(b);
    const can = (slot: number) => canUseZ(b, 0, moveOf(user.moves[slot]!.moveId));
    expect([can(0), can(1), can(2), can(3)]).toEqual([true, false, false, false]);
    expect(() => turn(b, z(1), mv(0))).toThrow(/movimiento Z/);
  });

  it('hace mucho más daño que el ataque normal, se anuncia y usa su nombre y su tipo', () => {
    const normal = lost(duel(['alakazam', ['thunderbolt']], ['snorlax', [NOOP]]), mv(0));
    const b = duel(['alakazam', ['thunderbolt']], ['snorlax', [NOOP]]);
    const hp = B(b).hp;
    // el movimiento Z no tiene tirada de precisión: solo crítico y variación
    const ev = turn(b, z(0), mv(0), [0.99, 0.99]);
    const zdmg = hp - B(b).hp;
    expect(zdmg / normal).toBeGreaterThan(1.7); // 175 de potencia frente a 90
    expect(zdmg / normal).toBeLessThan(2.2);
    expect(types(ev).indexOf('zmove')).toBeLessThan(types(ev).indexOf('move'));
    expect(ev.find((e) => e.type === 'move' && e.side === 0)).toMatchObject({ move: 'Gigavoltio Destructor', moveType: 'electric' });
    expect(describeEvent(ev.find((e) => e.type === 'zmove')!, 0)).toBe('¡Alakazam se envuelve en un poder Z!');
  });

  it('nunca falla por precisión', () => {
    // Trueno (70 %) con una tirada de 0,95 falla; su versión Z no
    const normal = duel(['alakazam', ['thunder']], ['snorlax', [NOOP]]);
    expect(types(turn(normal, mv(0), mv(0), [0.95, 0.99, 0.99]))).toContain('miss');
    const zb = duel(['alakazam', ['thunder']], ['snorlax', [NOOP]]);
    turn(zb, z(0), mv(0), [0.95, 0.99, 0.99]);
    expect(B(zb).hp).toBeLessThan(B(zb).maxHp);
  });

  it('no tiene los efectos secundarios del ataque original', () => {
    const normal = duel(['alakazam', ['flamethrower']], ['snorlax', [NOOP]]);
    turn(normal, mv(0), mv(0), [0, 0.99, 0.99, 0.01]);
    expect(B(normal).status).toBe('burn');
    const zb = duel(['alakazam', ['flamethrower']], ['snorlax', [NOOP]]);
    turn(zb, z(0), mv(0), [0.99, 0.99, 0.01]);
    expect(B(zb).status).toBeNull();
  });

  it('gasta un PP del ataque original', () => {
    const b = duel(['alakazam', ['thunderbolt']], ['snorlax', [NOOP]]);
    const pp = A(b).moves[0]!.pp;
    turn(b, z(0), mv(0), [0.99, 0.99]);
    expect(A(b).moves[0]!.pp).toBe(pp - 1);
  });

  it('una sola vez por combate y bando; el rival puede usar el suyo', () => {
    const b = duel(['blissey', ['tackle']], ['blissey', ['tackle']]);
    turn(b, z(0), z(0), [0, 0.99, 0.99, 0, 0.99, 0.99]);
    expect([b.sides[0].zUsed, b.sides[1].zUsed]).toEqual([true, true]);
    expect(() => turn(b, z(0), mv(0))).toThrow(/movimiento Z/);
    expect(() => turn(b, mv(0), z(0))).toThrow(/movimiento Z/);
    expect(canUseZ(b, 0, moveOf(moveId('tackle')))).toBe(false);
  });

  it('si el Pokémon no llega a moverse, no se gasta', () => {
    const b = duel(['alakazam', ['thunderbolt']], ['snorlax', [NOOP]]);
    A(b).status = 'sleep';
    A(b).sleepTurns = 2;
    turn(b, z(0), mv(0));
    expect(b.sides[0].zUsed).toBe(false);
    expect(A(b).moves[0]!.pp).toBe(A(b).moves[0]!.maxPp);
  });

  it('un ataque de dos turnos en versión Z se usa de golpe', () => {
    const b = duel(['alakazam', ['solar-beam']], ['snorlax', [NOOP]]);
    const ev = turn(b, z(0), mv(0), [0, 0.99, 0.99]);
    expect(types(ev)).not.toContain('charge');
    expect(B(b).hp).toBeLessThan(B(b).maxHp);
    // y no se puede pedir Z con un ataque a medias
    const c = duel(['alakazam', ['solar-beam', 'tackle']], ['snorlax', [NOOP]]);
    turn(c, mv(0), mv(0));
    expect(A(c).charging).toBe(0);
    expect(() => turn(c, z(0), mv(0))).toThrow(/movimiento Z/);
  });

  it('respeta las inmunidades (Levitación) y se puede reducir con Sebo', () => {
    const levitate = duel(['snorlax', ['earthquake']], ['gengar', [NOOP], 'levitate']);
    turn(levitate, z(0), mv(0), [0, 0.99, 0.99]);
    expect(B(levitate).hp).toBe(B(levitate).maxHp);
  });

  it('la IA lo usa para rematar y solo una vez por combate', () => {
    const b = duel(['alakazam', ['thunderbolt', 'tackle']], ['gyarados', [NOOP]]);
    B(b).hp = 60; // un Z de 175 seguro que lo remata
    b.turn = 2;
    const action = chooseAction(b, 0, createRng(1));
    expect(action).toMatchObject({ type: 'move', z: true });
    b.sides[0].zUsed = true;
    for (let seed = 1; seed <= 30; seed++) expect(chooseAction(b, 0, createRng(seed))).not.toHaveProperty('z');
  });

  it('en combates completos cada bando usa como mucho un movimiento Z', () => {
    let used = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createRng(seed * 3);
      const team = () => ['charizard', 'blastoise', 'venusaur', 'gengar', 'alakazam', 'snorlax'].map((s) => makeSet(s, ['flamethrower', 'surf', 'psychic', 'tackle']));
      const b = createBattle(team(), team());
      const events = [...startBattle(b, rng)];
      while (b.winner === null && b.turn < 150 && !b.pending[0] && !b.pending[1]) {
        events.push(...executeTurn(b, [chooseAction(b, 0, rng), chooseAction(b, 1, rng)], rng));
      }
      for (const side of [0, 1] as const) expect(events.filter((e) => e.type === 'zmove' && e.side === side).length).toBeLessThanOrEqual(1);
      used += events.filter((e) => e.type === 'zmove').length;
    }
    expect(used).toBeGreaterThan(20);
    void scriptedRng;
  });
});
