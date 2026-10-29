import { describe, expect, it } from 'vitest';
import { computeMoveDamage } from '../src/core/battle/damage';
import { describeEvent } from '../src/core/battle/log';
import { moveOf } from '../src/core/battle/state';
import { A, B, duel, has, moveId, mv, turn } from './helpers';

describe('subidas y bajadas de estadísticas', () => {
  it('Danza Espada sube el Ataque +2 y se anuncia', () => {
    const b = duel(['alakazam', ['swords-dance']], ['snorlax', ['light-screen']]);
    const ev = turn(b, mv(0), mv(0));
    expect(A(b).stages.atk).toBe(2);
    expect(ev.map((e) => describeEvent(e, 0))).toContain('El Ataque de Alakazam subió mucho.');
  });

  it('se limita a +6 / -6', () => {
    const b = duel(['alakazam', ['swords-dance']], ['snorlax', ['light-screen']]);
    A(b).stages.atk = 6;
    const ev = turn(b, mv(0), mv(0));
    expect(A(b).stages.atk).toBe(6);
    expect(ev.map((e) => describeEvent(e, 0))).toContain('El Ataque de Alakazam no puede subir más.');
    const c = duel(['alakazam', ['growl']], ['snorlax', ['light-screen']]);
    B(c).stages.atk = -6;
    expect(turn(c, mv(0), mv(0)).map((e) => describeEvent(e, 0))).toContain('El Ataque de Snorlax rival no puede bajar más.');
  });

  it('Gruñido baja el Ataque del rival; Cuerpo Puro lo evita', () => {
    const b = duel(['alakazam', ['growl']], ['snorlax', ['light-screen']]);
    turn(b, mv(0), mv(0));
    expect(B(b).stages.atk).toBe(-1);
    const c = duel(['alakazam', ['growl']], ['snorlax', ['light-screen'], 'clear-body']);
    const ev = turn(c, mv(0), mv(0));
    expect(B(c).stages.atk).toBe(0);
    expect(has(ev, (e) => e.type === 'ability')).toBe(true);
  });

  it('las mejoras cambian el daño y un crítico ignora las bajadas del atacante', () => {
    const b = duel(['snorlax', ['body-slam']], ['blissey', ['light-screen']]);
    const move = moveOf(moveId('body-slam'));
    const base = computeMoveDamage(A(b), B(b), move, { crit: false, roll: 100 });
    A(b).stages.atk = 2;
    expect(computeMoveDamage(A(b), B(b), move, { crit: false, roll: 100 })).toBeGreaterThan(base * 1.8);
    A(b).stages.atk = -6;
    expect(computeMoveDamage(A(b), B(b), move, { crit: false, roll: 100 })).toBeLessThan(base / 3);
    const critBase = (() => { A(b).stages.atk = 0; return computeMoveDamage(A(b), B(b), move, { crit: true, roll: 100 }); })();
    A(b).stages.atk = -6;
    expect(computeMoveDamage(A(b), B(b), move, { crit: true, roll: 100 })).toBe(critBase);
  });

  it('Sofoco baja el At. Esp. del propio usuario tras golpear', () => {
    const b = duel(['charizard', ['overheat']], ['snorlax', ['light-screen']]);
    turn(b, mv(0), mv(0), [0, 0.99, 0.99]);
    expect(A(b).stages.spa).toBe(-2);
  });

  it('un ataque de daño puede bajar una estadística del rival (Psíquico, 10 %)', () => {
    const b = duel(['alakazam', ['psychic']], ['snorlax', ['light-screen']]);
    turn(b, mv(0), mv(0), [0, 0.99, 0.99, 0.01]);
    expect(B(b).stages.spd).toBe(-1);
    const c = duel(['alakazam', ['psychic']], ['snorlax', ['light-screen']]);
    turn(c, mv(0), mv(0), [0, 0.99, 0.99, 0.99]);
    expect(B(c).stages.spd).toBe(0);
  });

  it('Ataque Arena baja la precisión del rival', () => {
    const b = duel(['alakazam', ['sand-attack']], ['snorlax', ['light-screen']]);
    turn(b, mv(0), mv(0));
    expect(B(b).stages.acc).toBe(-1);
  });
});
