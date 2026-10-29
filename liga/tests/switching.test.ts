import { describe, expect, it } from 'vitest';
import { executeTurn, legalSwitchTargets, sendOut, startBattle } from '../src/core/battle/engine';
import { createBattle } from '../src/core/battle/state';
import { A, B, abilityId, has, makeSet, mv, scriptedRng, sw, turn, types } from './helpers';

const NOOP = 'light-screen';

function squad() {
  return createBattle(
    [makeSet('snorlax', ['tackle']), makeSet('alakazam', ['psychic']), makeSet('blissey', ['tackle'])],
    [makeSet('jolteon', ['thunderbolt']), makeSet('gyarados', ['tackle'])],
  );
}

describe('cambios de Pokémon', () => {
  it('el cambio va antes que cualquier ataque, aunque el rival sea más rápido', () => {
    const b = squad();
    const ev = turn(b, sw(1), mv(0), [0, 0.99, 0.99]);
    expect(types(ev).slice(0, 4)).toEqual(['turn', 'recall', 'switch', 'move']);
    expect(b.sides[0].active).toBe(1);
    // el ataque del rival golpea al que acaba de entrar
    expect(A(b).name).toBe('Alakazam');
    expect(A(b).hp).toBeLessThan(A(b).maxHp);
    expect(b.sides[0].team[0]!.hp).toBe(b.sides[0].team[0]!.maxHp);
  });

  it('al retirarse pierde las mejoras pero conserva el estado principal', () => {
    const b = squad();
    A(b).stages.atk = 3;
    A(b).status = 'burn';
    turn(b, sw(1), mv(0));
    const old = b.sides[0].team[0]!;
    expect(old.stages.atk).toBe(0);
    expect(old.status).toBe('burn');
  });

  it('no se puede cambiar a un debilitado ni al que ya está en el campo', () => {
    const b = squad();
    b.sides[0].team[1]!.hp = 0;
    expect(legalSwitchTargets(b, 0)).toEqual([2]);
    expect(() => turn(b, sw(1), mv(0))).toThrow();
    expect(() => turn(b, sw(0), mv(0))).toThrow();
  });

  it('al debilitarse el activo hay que elegir reemplazo antes de seguir', () => {
    const b = squad();
    B(b).hp = 1;
    const ev = turn(b, mv(0), mv(0), [0, 0.99, 0.99]);
    expect(types(ev)).toContain('faint');
    expect(b.winner).toBeNull();
    expect(b.pending).toEqual([false, true]);
    expect(() => turn(b, mv(0), mv(0))).toThrow();
    expect(() => sendOut(b, 0, 1, scriptedRng([]))).toThrow(); // el bando 0 no tiene que elegir
    expect(() => sendOut(b, 1, 0, scriptedRng([]))).toThrow(); // el activo no vale
    const out = sendOut(b, 1, 1, scriptedRng([]));
    expect(types(out)).toEqual(['switch']);
    expect(b.pending).toEqual([false, false]);
    expect(B(b).name).toBe('Gyarados');
  });

  it('el combate acaba cuando se debilita el último Pokémon', () => {
    const b = squad();
    b.sides[1].team[1]!.hp = 0;
    B(b).hp = 1;
    const ev = turn(b, mv(0), mv(0), [0, 0.99, 0.99]);
    expect(b.winner).toBe(0);
    expect(types(ev).slice(-2)).toEqual(['faint', 'win']);
    expect(b.pending).toEqual([false, false]);
  });

  it('Sombra / Trampa Arena / Imán atrapan al rival, salvo a Fantasmas (y voladores en Trampa Arena)', () => {
    const trap = (ability: string, foe: string) => {
      const b = createBattle(
        [makeSet(foe, [NOOP]), makeSet('blissey', [NOOP])],
        [makeSet('snorlax', [NOOP], abilityId(ability))],
      );
      return legalSwitchTargets(b, 0);
    };
    expect(trap('shadow-tag', 'alakazam')).toEqual([]);
    expect(trap('shadow-tag', 'gengar')).toEqual([1]);
    expect(trap('arena-trap', 'alakazam')).toEqual([]);
    expect(trap('arena-trap', 'pidgeot')).toEqual([1]);
    expect(trap('magnet-pull', 'steelix')).toEqual([]);
    expect(trap('magnet-pull', 'alakazam')).toEqual([1]);
  });

  it('al empezar, Intimidación del Pokémon inicial baja el Ataque del rival', () => {
    const b = createBattle([makeSet('gyarados', [NOOP], abilityId('intimidate'))], [makeSet('snorlax', [NOOP])]);
    const ev = startBattle(b, scriptedRng([]));
    expect(types(ev).filter((t) => t === 'switch')).toHaveLength(2);
    expect(B(b).stages.atk).toBe(-1);
    expect(A(b).stages.atk).toBe(0);
  });

  it('Intimidación también actúa cuando entra un reemplazo', () => {
    const b = createBattle(
      [makeSet('snorlax', [NOOP]), makeSet('gyarados', [NOOP], abilityId('intimidate'))],
      [makeSet('blissey', [NOOP])],
    );
    const ev = turn(b, sw(1), mv(0));
    expect(has(ev, (e) => e.type === 'ability')).toBe(true);
    expect(B(b).stages.atk).toBe(-1);
    void executeTurn;
  });
});
