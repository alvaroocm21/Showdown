import { describe, expect, it } from 'vitest';
import { effectiveSpeed } from '../src/core/battle/turnOrder';
import { describeEvent } from '../src/core/battle/log';
import { computeMoveDamage } from '../src/core/battle/damage';
import { moveOf } from '../src/core/battle/state';
import { A, B, duel, has, moveId, mv, turn } from './helpers';

const NOOP = 'light-screen'; // sin efecto implementado: no hace nada

describe('estados principales', () => {
  it('Onda Trueno paraliza y el paralizado va a la mitad de velocidad', () => {
    const b = duel(['alakazam', ['thunder-wave']], ['snorlax', ['tackle']]);
    const before = effectiveSpeed(B(b));
    const ev = turn(b, mv(0), mv(0), [0]);
    expect(B(b).status).toBe('paralysis');
    expect(has(ev, (e) => e.type === 'status' && e.status === 'paralysis')).toBe(true);
    expect(effectiveSpeed(B(b))).toBe(Math.floor(before / 2));
  });

  it('un Pokémon paralizado puede quedarse sin moverse (25 %)', () => {
    const b = duel(['alakazam', ['tackle']], ['snorlax', ['tackle']]);
    B(b).status = 'paralysis';
    const ev = turn(b, mv(0), mv(0), [0, 0.99, 0.99, 0.1]);
    expect(has(ev, (e) => e.type === 'cantMove' && e.reason === 'paralysis' && e.side === 1)).toBe(true);
    expect(ev.filter((e) => e.type === 'move')).toHaveLength(1);
  });

  it('no se acumulan estados: falla si ya tiene uno', () => {
    const b = duel(['alakazam', ['thunder-wave']], ['snorlax', ['tackle']]);
    B(b).status = 'poison';
    const ev = turn(b, mv(0), mv(0), [0]);
    expect(B(b).status).toBe('poison');
    expect(has(ev, (e) => e.type === 'failed')).toBe(true);
  });

  it('inmunidades por tipo: fuego no se quema, eléctrico no se paraliza, acero no se envenena', () => {
    const wisp = duel(['alakazam', ['will-o-wisp']], ['charizard', ['tackle']]);
    turn(wisp, mv(0), mv(0), [0]);
    expect(B(wisp).status).toBeNull();
    const wave = duel(['alakazam', ['thunder-wave']], ['jolteon', ['tackle']]);
    turn(wave, mv(0), mv(0), [0]);
    expect(B(wave).status).toBeNull();
    const toxic = duel(['alakazam', ['toxic']], ['steelix', ['tackle']]);
    turn(toxic, mv(0), mv(0), [0]);
    expect(B(toxic).status).toBeNull();
  });

  it('quemadura: 1/16 de los PS al final del turno y mitad de daño físico', () => {
    const b = duel(['alakazam', [NOOP]], ['blissey', [NOOP]]);
    B(b).status = 'burn';
    const hp = B(b).hp;
    turn(b, mv(0), mv(0));
    expect(B(b).hp).toBe(hp - Math.floor(B(b).maxHp / 16));

    const c = duel(['snorlax', ['body-slam']], ['blissey', [NOOP]]);
    const move = moveOf(moveId('body-slam'));
    const normal = computeMoveDamage(A(c), B(c), move, { battle: c, crit: false, roll: 100 });
    A(c).status = 'burn';
    expect(computeMoveDamage(A(c), B(c), move, { battle: c, crit: false, roll: 100 })).toBe(Math.floor(normal / 2));
  });

  it('veneno 1/8 y veneno grave n/16 creciente', () => {
    const p = duel(['alakazam', [NOOP]], ['blissey', [NOOP]]);
    B(p).status = 'poison';
    const hp = B(p).hp;
    turn(p, mv(0), mv(0));
    expect(B(p).hp).toBe(hp - Math.floor(B(p).maxHp / 8));

    const t = duel(['alakazam', [NOOP]], ['blissey', [NOOP]]);
    B(t).status = 'toxic';
    const max = B(t).maxHp;
    turn(t, mv(0), mv(0));
    expect(B(t).hp).toBe(max - Math.floor(max / 16));
    turn(t, mv(0), mv(0));
    expect(B(t).hp).toBe(max - Math.floor(max / 16) - Math.floor((max * 2) / 16));
  });

  it('dormido: no puede actuar durante sus turnos y luego se despierta', () => {
    const b = duel(['alakazam', [NOOP]], ['snorlax', ['tackle']]);
    B(b).status = 'sleep';
    B(b).sleepTurns = 2;
    const e1 = turn(b, mv(0), mv(0));
    const e2 = turn(b, mv(0), mv(0));
    const e3 = turn(b, mv(0), mv(0));
    expect(has(e1, (e) => e.type === 'cantMove' && e.reason === 'sleep')).toBe(true);
    expect(has(e2, (e) => e.type === 'cantMove' && e.reason === 'sleep')).toBe(true);
    expect(has(e3, (e) => e.type === 'status' && e.status === null && e.was === 'sleep')).toBe(true);
    expect(has(e3, (e) => e.type === 'move' && e.side === 1)).toBe(true);
    expect(B(b).status).toBeNull();
  });

  it('congelado: 20 % de deshielo por turno y el fuego descongela', () => {
    const stays = duel(['alakazam', [NOOP]], ['snorlax', ['tackle']]);
    B(stays).status = 'freeze';
    expect(has(turn(stays, mv(0), mv(0), [0.9]), (e) => e.type === 'cantMove' && e.reason === 'freeze')).toBe(true);
    expect(B(stays).status).toBe('freeze');

    const thaws = duel(['alakazam', [NOOP]], ['snorlax', ['tackle']]);
    B(thaws).status = 'freeze';
    const ev = turn(thaws, mv(0), mv(0), [0.1]);
    expect(has(ev, (e) => e.type === 'status' && e.was === 'freeze')).toBe(true);
    expect(has(ev, (e) => e.type === 'move' && e.side === 1)).toBe(true);

    const fire = duel(['alakazam', ['ember']], ['snorlax', [NOOP]]);
    B(fire).status = 'freeze';
    turn(fire, mv(0), mv(0), [0, 0.99, 0.99]);
    expect(B(fire).status).toBeNull();
  });

  it('un ataque de daño puede provocar un estado secundario', () => {
    const b = duel(['alakazam', ['flamethrower']], ['snorlax', [NOOP]]);
    // precisión, crítico, variación y la tirada del 10 % de quemadura
    turn(b, mv(0), mv(0), [0, 0.99, 0.99, 0.01]);
    expect(B(b).status).toBe('burn');
    const c = duel(['alakazam', ['flamethrower']], ['snorlax', [NOOP]]);
    turn(c, mv(0), mv(0), [0, 0.99, 0.99, 0.99]);
    expect(C(c)).toBeNull();
  });

  it('textos en español', () => {
    const b = duel(['alakazam', ['thunder-wave']], ['snorlax', ['tackle']]);
    const ev = turn(b, mv(0), mv(0), [0]);
    const text = ev.map((e) => describeEvent(e, 0)).filter(Boolean);
    expect(text).toContain('¡Snorlax rival está paralizado! Quizá no pueda moverse.');
  });
});

const C = (b: ReturnType<typeof duel>) => B(b).status;
