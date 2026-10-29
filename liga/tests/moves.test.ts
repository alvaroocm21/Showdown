import { describe, expect, it } from 'vitest';
import { legalMoveSlots } from '../src/core/battle/engine';
import { isMoveImplemented, moveKind } from '../src/core/battle/moves';
import { moveOf } from '../src/core/battle/state';
import { MOVES } from '../src/core/data';
import { A, B, duel, has, moveId, mv, turn, types } from './helpers';

const NOOP = 'light-screen';
const HIT = [0, 0.99, 0.99];
const dealt = (ev: ReturnType<typeof turn>, side: 0 | 1) =>
  ev.filter((e) => e.type === 'damage' && e.side === side && e.cause === 'move').reduce((s, e) => s + (e.type === 'damage' ? e.amount : 0), 0);

describe('clasificación de ataques', () => {
  it('distingue ataques implementados de los que no hacen nada', () => {
    expect(moveKind(moveOf(moveId('tackle')))).toBe('damage');
    expect(moveKind(moveOf(moveId('seismic-toss')))).toBe('fixed');
    expect(moveKind(moveOf(moveId('fissure')))).toBe('ohko');
    expect(moveKind(moveOf(moveId('thunder-wave')))).toBe('status');
    expect(moveKind(moveOf(moveId('swords-dance')))).toBe('status');
    expect(moveKind(moveOf(moveId('recover')))).toBe('status');
    expect(isMoveImplemented(moveOf(moveId('light-screen')))).toBe(false);
    expect(isMoveImplemented(moveOf(moveId('focus-punch')))).toBe(false);
    const implemented = MOVES.filter(isMoveImplemented).length;
    expect(implemented / MOVES.length).toBeGreaterThan(0.7);
  });
});

describe('daño y efectos', () => {
  it('drenaje: el usuario recupera la mitad del daño', () => {
    const b = duel(['alakazam', ['mega-drain']], ['snorlax', [NOOP]]);
    A(b).hp = 10;
    const ev = turn(b, mv(0), mv(0), HIT);
    const d = dealt(ev, 1);
    expect(A(b).hp).toBe(10 + Math.max(1, Math.floor(d / 2)));
  });

  it('retroceso: el usuario pierde el 33 % del daño hecho', () => {
    const b = duel(['snorlax', ['double-edge']], ['blissey', [NOOP]]);
    const ev = turn(b, mv(0), mv(0), HIT);
    expect(A(b).hp).toBe(A(b).maxHp - Math.max(1, Math.floor((dealt(ev, 1) * 33) / 100)));
  });

  it('multigolpe: golpea el número de veces sorteado', () => {
    const two = duel(['snorlax', ['double-kick']], ['blissey', [NOOP]]);
    const ev2 = turn(two, mv(0), mv(0), [0, 0.99, 0.99, 0.99, 0.99]);
    expect(ev2.filter((e) => e.type === 'damage')).toHaveLength(2);
    expect(ev2.find((e) => e.type === 'hits')).toMatchObject({ count: 2 });

    const five = duel(['snorlax', ['fury-swipes']], ['blissey', [NOOP]]);
    const ev5 = turn(five, mv(0), mv(0), [0, 0.95, ...Array(10).fill(0.99)]);
    expect(ev5.find((e) => e.type === 'hits')).toMatchObject({ count: 5 });
  });

  it('Rayo Solar y similares tardan dos turnos y solo gastan un PP', () => {
    const b = duel(['alakazam', ['solar-beam', 'tackle']], ['snorlax', [NOOP]]);
    const pp = A(b).moves[0]!.pp;
    const e1 = turn(b, mv(0), mv(0), HIT);
    expect(types(e1)).toContain('charge');
    expect(B(b).hp).toBe(B(b).maxHp);
    expect(legalMoveSlots(A(b))).toEqual([0]);
    expect(() => turn(b, mv(1), mv(0))).toThrow(); // está obligado a terminar el ataque
    const e2 = turn(b, mv(0), mv(0), HIT);
    expect(B(b).hp).toBeLessThan(B(b).maxHp);
    expect(types(e2)).not.toContain('charge');
    expect(A(b).moves[0]!.pp).toBe(pp - 1);
  });

  it('Hiperrayo obliga a descansar el turno siguiente', () => {
    const b = duel(['snorlax', ['hyper-beam']], ['blissey', [NOOP]]);
    turn(b, mv(0), mv(0), HIT);
    expect(A(b).recharging).toBe(true);
    const e2 = turn(b, mv(0), mv(0), HIT);
    expect(has(e2, (e) => e.type === 'cantMove' && e.reason === 'recharge')).toBe(true);
    expect(A(b).recharging).toBe(false);
  });

  it('Sorpresa solo funciona el primer turno y hace retroceder', () => {
    const b = duel(['alakazam', ['fake-out', 'tackle']], ['jolteon', ['tackle']]);
    const e1 = turn(b, mv(0), mv(0), HIT);
    expect(has(e1, (e) => e.type === 'cantMove' && e.reason === 'flinch' && e.side === 1)).toBe(true);
    const e2 = turn(b, mv(0), mv(0), HIT);
    expect(types(e2)).toContain('failed');
  });

  it('Recuperación cura la mitad; Descanso cura todo y duerme', () => {
    const b = duel(['snorlax', ['recover']], ['blissey', [NOOP]]);
    A(b).hp = 1;
    turn(b, mv(0), mv(0));
    expect(A(b).hp).toBe(1 + Math.floor(A(b).maxHp / 2));
    const full = duel(['snorlax', ['recover']], ['blissey', [NOOP]]);
    expect(types(turn(full, mv(0), mv(0)))).toContain('failed');

    const r = duel(['snorlax', ['rest']], ['blissey', [NOOP]]);
    A(r).hp = 5;
    A(r).status = 'poison';
    turn(r, mv(0), mv(0));
    expect(A(r).hp).toBe(A(r).maxHp);
    expect(A(r).status).toBe('sleep');
  });

  it('daño fijo y KO de un golpe', () => {
    const st = duel(['alakazam', ['seismic-toss']], ['snorlax', [NOOP]]);
    expect(dealt(turn(st, mv(0), mv(0), [0]), 1)).toBe(50);
    const ghost = duel(['alakazam', ['seismic-toss']], ['gengar', [NOOP]]);
    turn(ghost, mv(0), mv(0), [0]);
    expect(B(ghost).hp).toBe(B(ghost).maxHp);
    const dr = duel(['alakazam', ['dragon-rage']], ['snorlax', [NOOP]]);
    expect(dealt(turn(dr, mv(0), mv(0), [0]), 1)).toBe(40);
    const sf = duel(['alakazam', ['super-fang']], ['snorlax', [NOOP]]);
    const hp = B(sf).hp;
    expect(dealt(turn(sf, mv(0), mv(0), [0]), 1)).toBe(Math.floor(hp / 2));
    const ko = duel(['alakazam', ['fissure']], ['snorlax', [NOOP]]);
    turn(ko, mv(0), mv(0), [0]);
    expect(ko.winner).toBe(0);
    const fly = duel(['alakazam', ['fissure']], ['pidgeot', [NOOP]]);
    turn(fly, mv(0), mv(0), [0]);
    expect(fly.winner).toBeNull();
  });

  it('Explosión debilita al usuario; si caen los dos pierde quien explotó', () => {
    const b = duel(['alakazam', ['explosion']], ['snorlax', [NOOP]]);
    B(b).hp = 1;
    const ev = turn(b, mv(0), mv(0), HIT);
    expect(A(b).hp).toBe(0);
    expect(b.winner).toBe(1);
    expect(types(ev).slice(-3)).toEqual(['faint', 'faint', 'win']);
    const ghost = duel(['alakazam', ['explosion']], ['gengar', [NOOP]]);
    turn(ghost, mv(0), mv(0), HIT);
    expect(A(ghost).hp).toBe(0); // el usuario cae aunque el rival sea inmune
  });

  it('Onda Trueno no afecta a un tipo Tierra', () => {
    const b = duel(['alakazam', ['thunder-wave']], ['swampert', [NOOP]]);
    expect(types(turn(b, mv(0), mv(0), [0]))).toContain('immune');
  });

  it('potencia variable: Fortuna fija y Plumas/Contraataque según PS', () => {
    const b = duel(['snorlax', ['flail']], ['blissey', [NOOP]]);
    const full = dealt(turn(b, mv(0), mv(0), HIT), 1);
    const c = duel(['snorlax', ['flail']], ['blissey', [NOOP]]);
    A(c).hp = 1;
    expect(dealt(turn(c, mv(0), mv(0), HIT), 1)).toBeGreaterThan(full * 5);
  });
});
