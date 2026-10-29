import { describe, expect, it } from 'vitest';
import { legalMoveSlots } from '../src/core/battle/engine';
import { describeEvent } from '../src/core/battle/log';
import { createBattle, activeOf } from '../src/core/battle/state';
import { A, B, abilityId, duel, field, has, makeSet, mv, scriptedRng, sw, turn, types } from './helpers';

const NOOP = 'light-screen';

describe('confusión', () => {
  it('Rayo Confuso confunde (2-5 turnos) y se avisa', () => {
    const b = duel(['alakazam', ['confuse-ray']], ['snorlax', [NOOP]]);
    const ev = turn(b, mv(0), mv(0), [0]);
    expect(B(b).confused).toBeGreaterThanOrEqual(2);
    expect(B(b).confused).toBeLessThanOrEqual(5);
    expect(ev.map((e) => describeEvent(e, 0))).toContain('¡Snorlax rival está confuso!');
  });

  it('un confuso puede golpearse a sí mismo (1/3) y entonces no ataca', () => {
    const b = duel(['alakazam', [NOOP]], ['snorlax', ['tackle']]);
    B(b).confused = 3;
    const ev = turn(b, mv(0), mv(0), [0.1, 0.5, 0.5]);
    const hurt = ev.find((e) => e.type === 'damage' && e.cause === 'confusion');
    expect(hurt).toBeDefined();
    expect(B(b).hp).toBeLessThan(B(b).maxHp);
    expect(A(b).hp).toBe(A(b).maxHp); // no llegó a atacar
    expect(ev.map((e) => describeEvent(e, 0))).toContain('¡Está tan confuso que se hirió a sí mismo!');
    expect(has(ev, (e) => e.type === 'move' && e.side === 1)).toBe(false); // el confuso no llega a atacar
  });

  it('si no se golpea, ataca con normalidad', () => {
    const b = duel(['alakazam', [NOOP]], ['snorlax', ['tackle']]);
    B(b).confused = 3;
    const ev = turn(b, mv(0), mv(0), [0.9, 0, 0.99, 0.99]);
    expect(has(ev, (e) => e.type === 'move' && e.side === 1)).toBe(true);
    expect(B(b).confused).toBe(2);
  });

  it('se pasa al acabarse los turnos', () => {
    const b = duel(['alakazam', [NOOP]], ['snorlax', ['tackle']]);
    B(b).confused = 1;
    const ev = turn(b, mv(0), mv(0), [0, 0.99, 0.99]);
    expect(B(b).confused).toBe(0);
    expect(ev.map((e) => describeEvent(e, 0))).toContain('¡Snorlax rival ya no está confuso!');
    expect(has(ev, (e) => e.type === 'move' && e.side === 1)).toBe(true);
  });

  it('el cambio de Pokémon quita la confusión', () => {
    const b = createBattle([makeSet('snorlax', [NOOP]), makeSet('blissey', [NOOP])], [makeSet('alakazam', [NOOP])]);
    A(b).confused = 4;
    turn(b, sw(1), mv(0));
    expect(b.sides[0].team[0]!.confused).toBe(0);
  });

  it('Ritmo Propio es inmune; Terreno Neblinoso la impide', () => {
    const own = duel(['alakazam', ['confuse-ray']], ['snorlax', [NOOP], 'own-tempo']);
    const ev = turn(own, mv(0), mv(0), [0]);
    expect(B(own).confused).toBe(0);
    expect(has(ev, (e) => e.type === 'ability')).toBe(true);
    const mist = field(duel(['alakazam', ['confuse-ray']], ['snorlax', [NOOP]]), null, 'misty');
    turn(mist, mv(0), mv(0), [0]);
    expect(B(mist).confused).toBe(0);
  });

  it('un confuso no puede volver a ser confundido', () => {
    const b = duel(['alakazam', ['confuse-ray']], ['snorlax', [NOOP]]);
    B(b).confused = 3;
    expect(types(turn(b, mv(0), mv(0), [0]))).toContain('failed');
    expect(B(b).confused).toBe(2); // sigue la misma confusión (se gasta un turno al actuar)
  });

  it('Contoneo sube el Ataque del rival +2 y lo confunde; Adulación, el At. Esp. +1', () => {
    const sw1 = duel(['alakazam', ['swagger']], ['snorlax', [NOOP]]);
    turn(sw1, mv(0), mv(0), [0]);
    expect(B(sw1).stages.atk).toBe(2);
    expect(B(sw1).confused).toBeGreaterThan(0);
    const fl = duel(['alakazam', ['flatter']], ['snorlax', [NOOP]]);
    turn(fl, mv(0), mv(0), [0]);
    expect(B(fl).stages.spa).toBe(1);
    expect(B(fl).confused).toBeGreaterThan(0);
  });

  it('los ataques de daño pueden confundir (Psicorrayo 10 %, Puño Dinámico 100 %)', () => {
    const psy = duel(['alakazam', ['psybeam']], ['snorlax', [NOOP]]);
    turn(psy, mv(0), mv(0), [0, 0.99, 0.99, 0.01]);
    expect(B(psy).confused).toBeGreaterThan(0);
    const none = duel(['alakazam', ['psybeam']], ['snorlax', [NOOP]]);
    turn(none, mv(0), mv(0), [0, 0.99, 0.99, 0.99]);
    expect(B(none).confused).toBe(0);
    const dyn = duel(['machamp', ['dynamic-punch']], ['cloyster', [NOOP]]); // duro físicamente: sobrevive al golpe
    turn(dyn, mv(0), mv(0), [0, 0.99, 0.99, 0.5]);
    expect(B(dyn).confused).toBeGreaterThan(0);
  });

  it('Pies Torpes duplica la evasión del confuso', () => {
    const b = duel(['alakazam', ['thunderbolt']], ['snorlax', [NOOP], 'tangled-feet']);
    // 100 de precisión → con la evasión de Pies Torpes y confuso pasa a 50 %: una tirada de 0,6 falla
    B(b).confused = 3;
    expect(types(turn(b, mv(0), mv(0), [0.6, 0.99, 0.99]))).toContain('miss');
    const free = duel(['alakazam', ['thunderbolt']], ['snorlax', [NOOP], 'tangled-feet']);
    turn(free, mv(0), mv(0), [0.6, 0.99, 0.99]);
    expect(B(free).hp).toBeLessThan(B(free).maxHp);
  });
});

describe('Canto Mortal y Cuerpo Mortal', () => {
  it('los dos se debilitan a los 3 turnos si no cambian', () => {
    const b = duel(['alakazam', ['perish-song', NOOP]], ['snorlax', [NOOP]]);
    turn(b, mv(0), mv(0));
    expect([A(b).perish, B(b).perish]).toEqual([3, 3]);
    turn(b, mv(1), mv(0));
    expect([A(b).perish, B(b).perish]).toEqual([2, 2]);
    turn(b, mv(1), mv(0));
    const ev = turn(b, mv(1), mv(0));
    expect(types(ev).filter((t) => t === 'faint')).toHaveLength(2);
    expect(b.winner).not.toBeNull();
  });

  it('cambiar de Pokémon quita la cuenta atrás', () => {
    const b = createBattle([makeSet('alakazam', ['perish-song']), makeSet('blissey', [NOOP])], [makeSet('snorlax', [NOOP])]);
    turn(b, mv(0), mv(0));
    turn(b, sw(1), mv(0));
    expect(b.sides[0].team[0]!.perish).toBe(0);
    expect(A(b).perish).toBe(0);
    expect(B(b).perish).toBe(2);
  });

  it('Cuerpo Mortal: al contacto los dos empiezan la cuenta atrás', () => {
    const b = duel(['snorlax', ['tackle']], ['blissey', [NOOP], 'perish-body']);
    turn(b, mv(0), mv(0), [0, 0.99, 0.99]);
    expect([A(b).perish > 0, B(b).perish > 0]).toEqual([true, true]);
  });
});

describe('Anulación y Cuerpo Maldito', () => {
  it('Anulación bloquea el último ataque del rival durante 4 turnos', () => {
    const b = duel(['steelix', ['disable', NOOP]], ['snorlax', ['tackle', 'body-slam']]);
    turn(b, mv(1), mv(0), [0, 0.99, 0.99]); // el rival usa Placaje
    turn(b, mv(0), mv(1), [0, 0.99, 0.99]); // le anulan lo último que hizo (Placaje)
    expect(B(b).disabled).toMatchObject({ moveId: B(b).moves[0]!.moveId });
    expect(legalMoveSlots(B(b))).toEqual([1]);
    expect(() => turn(b, mv(1), mv(0))).toThrow();
    for (let i = 0; i < 4; i++) turn(b, mv(1), mv(1), [0, 0.99, 0.99]);
    expect(B(b).disabled).toBeNull();
  });

  it('falla si el rival aún no ha usado ningún ataque', () => {
    const b = duel(['blissey', ['disable']], ['snorlax', ['tackle']]);
    expect(types(turn(b, mv(0), mv(0)))).toContain('failed');
  });

  it('Cuerpo Maldito: 30 % de anular el ataque con el que le golpean', () => {
    const b = duel(['snorlax', ['tackle']], ['blissey', [NOOP], 'cursed-body']);
    turn(b, mv(0), mv(0), [0, 0.99, 0.99, 0.1]);
    expect(A(b).disabled).toMatchObject({ moveId: A(b).moves[0]!.moveId });
    const no = duel(['snorlax', ['tackle']], ['blissey', [NOOP], 'cursed-body']);
    turn(no, mv(0), mv(0), [0, 0.99, 0.99, 0.9]);
    expect(A(no).disabled).toBeNull();
  });
});

describe('cambios forzados', () => {
  const team = () => [makeSet('snorlax', [NOOP]), makeSet('blissey', [NOOP]), makeSet('gengar', [NOOP])];

  it('Rugido cambia al rival por otro Pokémon al azar', () => {
    const b = createBattle([makeSet('alakazam', ['roar'])], team());
    const ev = turn(b, mv(0), mv(0), [0.9]);
    expect(types(ev)).toContain('recall');
    expect(types(ev)).toContain('switch');
    expect(b.sides[1].active).not.toBe(0);
    expect(b.sides[1].team[0]!.hp).toBe(b.sides[1].team[0]!.maxHp);
  });

  it('Cola Dragón hace daño y cambia al rival', () => {
    const b = createBattle([makeSet('snorlax', ['dragon-tail'])], team());
    const ev = turn(b, mv(0), mv(0), [0, 0.99, 0.99]);
    expect(types(ev)).toContain('damage');
    expect(b.sides[1].active).not.toBe(0);
  });

  it('no funciona si al rival no le quedan compañeros, ni con Ventosas', () => {
    const solo = duel(['alakazam', ['roar']], ['snorlax', [NOOP]]);
    expect(types(turn(solo, mv(0), mv(0), [0.9]))).toContain('failed');
    const anchored = createBattle([makeSet('alakazam', ['roar'])], [makeSet('snorlax', [NOOP], abilityId('suction-cups')), makeSet('blissey', [NOOP])]);
    turn(anchored, mv(0), mv(0), [0.9]);
    expect(anchored.sides[1].active).toBe(0);
  });
});

void activeOf;
