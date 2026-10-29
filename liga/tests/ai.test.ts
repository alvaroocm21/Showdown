import { describe, expect, it } from 'vitest';
import { chooseAction, chooseReplacement } from '../src/core/ai';
import { createBattle } from '../src/core/battle/state';
import { createRng } from '../src/core/rng';
import { A, makeSet } from './helpers';

const NOOP = 'light-screen';

describe('IA con equipos', () => {
  it('cambia cuando no puede dañar al rival y tiene un compañero útil', () => {
    const b = createBattle(
      [makeSet('snorlax', [NOOP, 'protect']), makeSet('alakazam', ['psychic'])],
      [makeSet('blissey', ['tackle'])],
    );
    b.turn = 3;
    let switches = 0;
    for (let seed = 1; seed <= 40; seed++) if (chooseAction(b, 0, createRng(seed)).type === 'switch') switches++;
    expect(switches).toBeGreaterThan(20);
  });

  it('no cambia si va ganando el enfrentamiento ni acaba de entrar', () => {
    const win = createBattle(
      [makeSet('alakazam', ['psychic']), makeSet('snorlax', ['tackle'])],
      [makeSet('machamp', ['karate-chop'])],
    );
    win.turn = 3;
    for (let seed = 1; seed <= 40; seed++) expect(chooseAction(win, 0, createRng(seed)).type).toBe('move');

    const fresh = createBattle(
      [makeSet('snorlax', [NOOP]), makeSet('alakazam', ['psychic'])],
      [makeSet('blissey', ['tackle'])],
    );
    for (let seed = 1; seed <= 40; seed++) expect(chooseAction(fresh, 0, createRng(seed)).type).toBe('move');
  });

  it('el reemplazo elegido es el que mejor se enfrenta al rival', () => {
    const b = createBattle(
      [makeSet('snorlax', ['tackle']), makeSet('venusaur', ['razor-leaf']), makeSet('blastoise', ['surf'])],
      [makeSet('charizard', ['flamethrower'])],
    );
    A(b).hp = 0;
    expect(chooseReplacement(b, 0)).toBe(2);
  });

  it('usa un ataque de estado útil y no lo repite si ya hizo efecto', () => {
    const b = createBattle([makeSet('snorlax', ['tackle'])], [makeSet('alakazam', ['thunder-wave', 'seismic-toss'])]);
    const first = chooseAction(b, 1, createRng(1));
    expect(first.type).toBe('move');
    A(b).status = 'paralysis';
    // con el rival ya paralizado, Onda Trueno no vale nada
    for (let seed = 1; seed <= 30; seed++) expect(chooseAction(b, 1, createRng(seed))).toEqual({ type: 'move', slot: 1 });
  });

  it('descansa o se cura cuando le quedan pocos PS', () => {
    // Steelix resiste Normal y su Ataque es bajo: curarse compensa más que atacar
    const b = createBattle([makeSet('steelix', ['tackle'])], [makeSet('snorlax', ['recover', 'tackle'])]);
    b.sides[1].team[0]!.hp = 10;
    let heals = 0;
    for (let seed = 1; seed <= 30; seed++) if ((chooseAction(b, 1, createRng(seed)) as { slot: number }).slot === 0) heals++;
    expect(heals).toBeGreaterThan(15);
  });
});
