import { describe, expect, it } from 'vitest';
import { computeMoveDamage } from '../src/core/battle/damage';
import { INAPPLICABLE, IMPLEMENTED_ABILITIES, inapplicableReason, isAbilityImplemented } from '../src/core/battle/abilities';
import { effectiveSpeed } from '../src/core/battle/turnOrder';
import { createBattle, moveOf } from '../src/core/battle/state';
import { ABILITIES } from '../src/core/data';
import { A, B, INERT_ABILITY_SLUG, abilityId, duel, has, makeSet, moveId, mv, sw, turn, types } from './helpers';

const NOOP = 'light-screen';
const HIT = [0, 0.99, 0.99];
const dmg = (b: ReturnType<typeof duel>, slug: string, crit = false) =>
  computeMoveDamage(A(b), B(b), moveOf(moveId(slug)), { battle: b, crit, roll: 100 });

describe('cobertura de habilidades', () => {
  it('todas las habilidades del juego tienen efecto o están marcadas como no aplicables, con su motivo', () => {
    const slugs = new Set(ABILITIES.map((a) => a.slug));
    for (const a of ABILITIES) {
      const implemented = isAbilityImplemented(a.slug);
      const reason = inapplicableReason(a.slug);
      expect(implemented || !!reason, `${a.slug} sin clasificar`).toBe(true);
      expect(implemented && !!reason, `${a.slug} está en las dos listas`).toBe(false);
    }
    // ningún nombre inventado en el registro ni en la lista de «no aplica»
    for (const s of [...IMPLEMENTED_ABILITIES, ...Object.keys(INAPPLICABLE)]) expect(slugs.has(s), s).toBe(true);
    expect(IMPLEMENTED_ABILITIES.size).toBeGreaterThan(240);
  });

  it('las habilidades de Teracristalización no están en el juego', () => {
    for (const s of ['tera-shift', 'tera-shell', 'teraform-zero', 'embody-aspect']) expect(ABILITIES.some((a) => a.slug === s), s).toBe(false);
  });

  it('la habilidad inerte de las pruebas realmente no hace nada', () => {
    expect(isAbilityImplemented(INERT_ABILITY_SLUG)).toBe(false);
    expect(inapplicableReason(INERT_ABILITY_SLUG)).toBeTruthy();
  });
});

describe('modifican el daño', () => {
  it('Potencia / Poder Puro duplican el Ataque (solo ataques físicos)', () => {
    const plain = duel(['snorlax', ['body-slam', 'psychic']], ['blissey', [NOOP]]);
    const huge = duel(['snorlax', ['body-slam', 'psychic'], 'huge-power'], ['blissey', [NOOP]]);
    expect(dmg(huge, 'body-slam')).toBeGreaterThan(dmg(plain, 'body-slam') * 1.8);
    expect(dmg(huge, 'psychic')).toBe(dmg(plain, 'psychic'));
  });

  it('Espesura / Mar Llamas / Torrente / Enjambre potencian su tipo con pocos PS', () => {
    for (const [ability, move] of [['overgrow', 'razor-leaf'], ['blaze', 'ember'], ['torrent', 'water-gun'], ['swarm', 'twineedle']] as const) {
      const b = duel([ 'snorlax', [move], ability], ['blissey', [NOOP]]);
      const normal = dmg(b, move);
      A(b).hp = Math.floor(A(b).maxHp / 3);
      expect(dmg(b, move), ability).toBeGreaterThan(normal * 1.3);
    }
  });

  it('Sebo reduce a la mitad el daño de fuego y hielo', () => {
    const a = duel(['alakazam', ['flamethrower']], ['snorlax', [NOOP]]);
    const t = duel(['alakazam', ['flamethrower']], ['snorlax', [NOOP], 'thick-fat']);
    expect(dmg(t, 'flamethrower')).toBeLessThan(dmg(a, 'flamethrower') * 0.6);
  });

  it('Agallas sube el Ataque con un estado y no sufre la penalización de la quemadura', () => {
    const b = duel(['snorlax', ['body-slam'], 'guts'], ['blissey', [NOOP]]);
    const base = dmg(b, 'body-slam');
    A(b).status = 'burn';
    expect(dmg(b, 'body-slam')).toBeGreaterThan(base * 1.4);
  });

  it('Escama Especial sube la Defensa con un estado', () => {
    const b = duel(['snorlax', ['body-slam']], ['blissey', [NOOP], 'marvel-scale']);
    const base = dmg(b, 'body-slam');
    B(b).status = 'poison';
    expect(dmg(b, 'body-slam')).toBeLessThan(base * 0.75);
  });
});

describe('inmunidades y absorciones', () => {
  it('Levitación anula los ataques de tierra', () => {
    const b = duel(['snorlax', ['earthquake']], ['gengar', [NOOP], 'levitate']);
    const ev = turn(b, mv(0), mv(0), HIT);
    expect(B(b).hp).toBe(B(b).maxHp);
    expect(has(ev, (e) => e.type === 'ability')).toBe(true);
  });

  it('Absorbe Agua / Absorbe Electricidad curan un cuarto en vez de dañar', () => {
    for (const [ability, move] of [['water-absorb', 'surf'], ['volt-absorb', 'thunderbolt']] as const) {
      const b = duel(['alakazam', [move]], ['snorlax', [NOOP], ability]);
      B(b).hp = Math.floor(B(b).maxHp / 2);
      const hp = B(b).hp;
      const ev = turn(b, mv(0), mv(0), HIT);
      expect(B(b).hp, ability).toBe(hp + Math.floor(B(b).maxHp / 4));
      expect(types(ev)).toContain('heal');
    }
  });

  it('Absorbe Fuego anula el fuego y potencia los siguientes ataques de fuego', () => {
    const b = duel(['alakazam', ['ember']], ['charizard', ['flamethrower'], 'flash-fire']);
    turn(b, mv(0), mv(0), HIT);
    expect(B(b).hp).toBe(B(b).maxHp);
    expect(B(b).flashFire).toBe(true);
  });

  it('Pararrayos absorbe electricidad y sube el At. Esp.', () => {
    const b = duel(['alakazam', ['thunderbolt']], ['snorlax', [NOOP], 'lightning-rod']);
    turn(b, mv(0), mv(0), HIT);
    expect(B(b).stages.spa).toBe(1);
    expect(B(b).hp).toBe(B(b).maxHp);
  });

  it('Superguarda solo deja pasar los ataques superefectivos', () => {
    const b = duel(['alakazam', ['tackle', 'shadow-ball']], ['gengar', [NOOP], 'wonder-guard']);
    turn(b, mv(0), mv(0), HIT);
    expect(B(b).hp).toBe(B(b).maxHp);
    turn(b, mv(1), mv(0), HIT);
    expect(B(b).hp).toBeLessThan(B(b).maxHp);
  });

  it('Robustez aguanta con 1 PS un golpe mortal desde la vida completa y anula los KO', () => {
    const b = duel(['snorlax', ['hyper-beam']], ['blissey', [NOOP], 'sturdy']);
    B(b).maxHp = B(b).hp = 20;
    turn(b, mv(0), mv(0), HIT);
    expect(B(b).hp).toBe(1);
    const c = duel(['snorlax', ['fissure']], ['blissey', [NOOP], 'sturdy']);
    const ev = turn(c, mv(0), mv(0), [0]);
    expect(B(c).hp).toBe(B(c).maxHp);
    expect(has(ev, (e) => e.type === 'ability')).toBe(true);
  });

  it('Armadura Batalla evita los críticos', () => {
    const b = duel(['snorlax', ['tackle']], ['blissey', [NOOP], 'battle-armor']);
    const ev = turn(b, mv(0), mv(0), [0, 0.0, 0.99]); // tirada de crítico muy baja: sería crítico
    expect(types(ev)).not.toContain('crit');
    const c = duel(['snorlax', ['tackle']], ['blissey', [NOOP]]);
    expect(types(turn(c, mv(0), mv(0), [0, 0.0, 0.99]))).toContain('crit');
  });

  it('Polvo Escudo anula los efectos secundarios; Foco Interno evita el retroceso', () => {
    const b = duel(['alakazam', ['flamethrower']], ['snorlax', [NOOP], 'shield-dust']);
    turn(b, mv(0), mv(0), [0, 0.99, 0.99, 0.01]);
    expect(B(b).status).toBeNull();
    const c = duel(['alakazam', ['fake-out']], ['snorlax', ['tackle'], 'inner-focus']);
    const ev = turn(c, mv(0), mv(0), HIT);
    expect(types(ev)).not.toContain('cantMove');
  });

  it('Flexibilidad / Insomnio / Inmunidad / Velo Agua / Armadura Magma bloquean su estado', () => {
    const cases: [string, string][] = [
      ['limber', 'thunder-wave'], ['insomnia', 'hypnosis'], ['vital-spirit', 'hypnosis'],
      ['immunity', 'toxic'], ['water-veil', 'will-o-wisp'],
    ];
    for (const [ability, move] of cases) {
      const b = duel(['alakazam', [move]], ['snorlax', [NOOP], ability]);
      turn(b, mv(0), mv(0), [0]);
      expect(B(b).status, ability).toBeNull();
    }
    const ice = duel(['alakazam', ['ice-beam']], ['snorlax', [NOOP], 'magma-armor']);
    turn(ice, mv(0), mv(0), [0, 0.99, 0.99, 0.01]);
    expect(B(ice).status).toBeNull();
  });

  it('Cuerpo Puro, Garra Dura y Vista Lince evitan sus bajadas', () => {
    const cases: [string, string, 'atk' | 'acc'][] = [
      ['hyper-cutter', 'growl', 'atk'], ['keen-eye', 'sand-attack', 'acc'], ['white-smoke', 'growl', 'atk'],
    ];
    for (const [ability, move, stat] of cases) {
      const b = duel(['alakazam', [move]], ['snorlax', [NOOP], ability]);
      turn(b, mv(0), mv(0));
      expect(B(b).stages[stat], ability).toBe(0);
    }
  });
});

describe('efectos al contacto, al entrar y al final del turno', () => {
  it('Electricidad Estática / Punto Tóxico / Cuerpo Llama pueden afectar al atacante (30 %)', () => {
    for (const [ability, status] of [['static', 'paralysis'], ['poison-point', 'poison'], ['flame-body', 'burn']] as const) {
      const b = duel(['snorlax', ['tackle']], ['blissey', [NOOP], ability]);
      turn(b, mv(0), mv(0), [0, 0.99, 0.99, 0.1]);
      expect(A(b).status, ability).toBe(status);
      const c = duel(['snorlax', ['tackle']], ['blissey', [NOOP], ability]);
      turn(c, mv(0), mv(0), [0, 0.99, 0.99, 0.9]);
      expect(A(c).status).toBeNull();
    }
    // sin contacto no hay efecto
    const d = duel(['alakazam', ['psychic']], ['blissey', [NOOP], 'static']);
    turn(d, mv(0), mv(0), [0, 0.99, 0.99, 0.1]);
    expect(A(d).status).toBeNull();
  });

  it('Piel Tosca hiere al atacante con 1/8 de sus PS', () => {
    const b = duel(['snorlax', ['tackle']], ['blissey', [NOOP], 'rough-skin']);
    turn(b, mv(0), mv(0), HIT);
    expect(A(b).hp).toBe(A(b).maxHp - Math.floor(A(b).maxHp / 8));
  });

  it('Impulso sube la Velocidad al final de cada turno', () => {
    const b = duel(['alakazam', [NOOP]], ['snorlax', [NOOP], 'speed-boost']);
    turn(b, mv(0), mv(0));
    turn(b, mv(0), mv(0));
    expect(B(b).stages.spe).toBe(2);
  });

  it('Cura Natural cura el estado al retirarse; Muda lo cura con 1/3 de probabilidad', () => {
    const b = createBattle([makeSet('snorlax', [NOOP], abilityId('natural-cure')), makeSet('blissey', [NOOP])], [makeSet('alakazam', [NOOP])]);
    A(b).status = 'poison';
    turn(b, sw(1), mv(0));
    expect(b.sides[0].team[0]!.status).toBeNull();
    const c = duel(['snorlax', [NOOP], 'shed-skin'], ['alakazam', [NOOP]]);
    A(c).status = 'burn';
    turn(c, mv(0), mv(0), [0.1]);
    expect(A(c).status).toBeNull();
  });

  it('Sincronía devuelve quemadura, parálisis y veneno', () => {
    const b = duel(['alakazam', ['thunder-wave']], ['snorlax', [NOOP], 'synchronize']);
    turn(b, mv(0), mv(0), [0]);
    expect(B(b).status).toBe('paralysis');
    expect(A(b).status).toBe('paralysis');
  });

  it('Cambio Color cambia el tipo al del último ataque recibido', () => {
    const b = duel(['alakazam', ['surf']], ['snorlax', [NOOP], 'color-change']);
    turn(b, mv(0), mv(0), HIT);
    expect(B(b).types).toEqual(['water']);
  });

  it('Presión gasta un PP extra; Letargo hace perder turnos; Madrugar acorta el sueño', () => {
    const b = duel(['alakazam', ['tackle']], ['snorlax', [NOOP], 'pressure']);
    const pp = A(b).moves[0]!.pp;
    turn(b, mv(0), mv(0), HIT);
    expect(A(b).moves[0]!.pp).toBe(pp - 2);

    const t = duel(['alakazam', [NOOP]], ['snorlax', ['tackle'], 'truant']);
    const e1 = turn(t, mv(0), mv(0), HIT);
    const e2 = turn(t, mv(0), mv(0), HIT);
    expect(has(e1, (e) => e.type === 'move' && e.side === 1)).toBe(true);
    expect(has(e2, (e) => e.type === 'cantMove' && e.reason === 'truant')).toBe(true);

    const slow = duel(['alakazam', [NOOP]], ['snorlax', ['tackle']]);
    const early = duel(['alakazam', [NOOP]], ['snorlax', ['tackle'], 'early-bird']);
    for (const x of [slow, early]) { B(x).status = 'sleep'; B(x).sleepTurns = 3; }
    for (let i = 0; i < 2; i++) { turn(slow, mv(0), mv(0)); turn(early, mv(0), mv(0)); }
    expect(early.sides[1].team[0]!.sleepTurns).toBeLessThan(slow.sides[1].team[0]!.sleepTurns);
  });

  it('Gran Encanto duplica la probabilidad de efectos secundarios', () => {
    const b = duel(['alakazam', ['flamethrower'], 'serene-grace'], ['snorlax', [NOOP]]);
    turn(b, mv(0), mv(0), [0, 0.99, 0.99, 0.15]); // 15 % < 20 % (10 % × 2)
    expect(B(b).status).toBe('burn');
  });

  it('Viscosecreción daña a quien drena', () => {
    const b = duel(['alakazam', ['mega-drain']], ['snorlax', [NOOP], 'liquid-ooze']);
    const hp = A(b).hp;
    turn(b, mv(0), mv(0), HIT);
    expect(A(b).hp).toBeLessThan(hp);
  });

  it('Cabeza Roca evita el retroceso; Humedad impide la explosión', () => {
    const rock = duel(['snorlax', ['double-edge'], 'rock-head'], ['blissey', [NOOP]]);
    turn(rock, mv(0), mv(0), HIT);
    expect(A(rock).hp).toBe(A(rock).maxHp);
    const damp = duel(['snorlax', ['explosion']], ['blissey', [NOOP], 'damp']);
    const ev = turn(damp, mv(0), mv(0), HIT);
    expect(A(damp).hp).toBe(A(damp).maxHp);
    expect(types(ev)).toContain('failed');
  });

  it('Velocidad efectiva: parálisis y mejoras se combinan', () => {
    const b = duel(['alakazam', [NOOP]], ['snorlax', [NOOP]]);
    const base = effectiveSpeed(A(b));
    A(b).stages.spe = 2;
    A(b).status = 'paralysis';
    expect(effectiveSpeed(A(b))).toBe(Math.floor((base * 2) / 2));
  });
});
