import { describe, expect, it } from 'vitest';
import type { Battle } from '../src/core/battle/state';
import { A, B, dmg, duel, field } from './helpers';

const NOOP = 'light-screen';
type Setup = (b: Battle) => void;

/** Proporción del daño con la habilidad en el atacante respecto a la misma situación sin ella. */
function outgoing(ability: string, move: string, opts: { target?: string; setup?: Setup; crit?: boolean; movesLast?: boolean; attacker?: string } = {}): number {
  const make = (ab?: string) => {
    const b = duel([opts.attacker ?? 'snorlax', [move], ab], [opts.target ?? 'blissey', [NOOP]]);
    opts.setup?.(b);
    return b;
  };
  const o = { crit: opts.crit, movesLast: opts.movesLast };
  return dmg(make(ability), move, o) / dmg(make(), move, o);
}

/** Proporción del daño con la habilidad en el defensor. */
function incoming(ability: string, move: string, opts: { target?: string; setup?: Setup; attacker?: string } = {}): number {
  const make = (ab?: string) => {
    const b = duel([opts.attacker ?? 'snorlax', [move]], [opts.target ?? 'blissey', [NOOP], ab]);
    opts.setup?.(b);
    return b;
  };
  return dmg(make(ability), move) / dmg(make(), move);
}

/** Proporción cercana a la esperada (±7 %: con daños pequeños el redondeo de cada paso se nota). */
const near = (value: number, expected: number) => expect(Math.abs(value / expected - 1), `${value} ≈ ${expected}`).toBeLessThan(0.07);

const sun: Setup = (b) => void field(b, 'sun');
const sand: Setup = (b) => void field(b, 'sand');
const rain: Setup = (b) => void field(b, 'rain');

describe('potencian sus ataques', () => {
  const cases: [string, string, number, Parameters<typeof outgoing>[2]?][] = [
    ['iron-fist', 'mach-punch', 1.2], ['strong-jaw', 'bite', 1.5], ['mega-launcher', 'water-pulse', 1.5], ['tough-claws', 'tackle', 1.3],
    ['sharpness', 'slash', 1.5], ['technician', 'tackle', 1.5], ['reckless', 'double-edge', 1.2], ['steelworker', 'metal-claw', 1.5],
    ['transistor', 'thunderbolt', 1.3], ['dragons-maw', 'dragon-claw', 1.5], ['rocky-payload', 'rock-slide', 1.5], ['fire-mane', 'ember', 1.5],
    ['sheer-force', 'flamethrower', 1.3], ['punk-rock', 'hyper-voice', 1.3], ['water-bubble', 'surf', 2],
  ];
  for (const [ability, move, ratio, opts] of cases) {
    it(`${ability} con ${move}: ×${ratio}`, () => near(outgoing(ability, move, opts), ratio));
  }

  it('Técnico solo con ataques de 60 de potencia o menos', () => {
    near(outgoing('technician', 'body-slam'), 1); // 85
  });
  it('Analítico: ×1,3 si actúa el último', () => {
    near(outgoing('analytic', 'tackle', { movesLast: true }), 1.3);
    near(outgoing('analytic', 'tackle', { movesLast: false }), 1);
  });
  it('Adaptable: el STAB pasa de ×1,5 a ×2', () => expect(outgoing('adaptability', 'tackle')).toBeCloseTo(2 / 1.5, 1));
  it('Francotirador: el crítico pasa de ×1,5 a ×2,25', () => expect(outgoing('sniper', 'tackle', { crit: true })).toBeCloseTo(1.5, 1));
  it('Cristal Lente: duplica los ataques poco eficaces; Neurofuerza sube un 25 % los muy eficaces', () => {
    near(outgoing('tinted-lens', 'ember', { target: 'charizard' }), 2);
    near(outgoing('tinted-lens', 'tackle'), 1);
    near(outgoing('neuroforce', 'surf', { target: 'charizard' }), 1.25);
  });
  it('Vigilante: duplica el Ataque contra quien acaba de entrar', () => {
    near(outgoing('stakeout', 'tackle', { setup: (b) => void (b.sides[1].enteredTurn = b.turn) }), 2);
    near(outgoing('stakeout', 'tackle', { setup: (b) => void ((b.turn = 5), (b.sides[1].enteredTurn = 2)) }), 1);
  });
  it('Táctica Gorila ×1,5 el Ataque físico', () => expect(outgoing('gorilla-tactics', 'tackle')).toBeCloseTo(1.5, 1));
  it('Ímpetu Tóxico y Ímpetu Ardiente con su estado', () => {
    near(outgoing('toxic-boost', 'tackle', { setup: (b) => void (A(b).status = 'poison') }), 1.5);
    near(outgoing('toxic-boost', 'tackle'), 1);
    near(outgoing('flare-boost', 'flamethrower', { setup: (b) => void (A(b).status = 'burn') }), 1.5);
  });
  it('Poder Solar y Don Floral con sol', () => {
    near(outgoing('solar-power', 'psychic', { setup: sun }), 1.5);
    near(outgoing('solar-power', 'psychic'), 1);
    near(outgoing('flower-gift', 'tackle', { setup: sun }), 1.5);
  });
  it('Poder Arena con tormenta de arena y roca, tierra o acero', () => {
    near(outgoing('sand-force', 'earthquake', { setup: sand }), 1.3);
    near(outgoing('sand-force', 'tackle', { setup: sand }), 1);
    near(outgoing('sand-force', 'earthquake'), 1);
  });
  it('Inicio Lento y Derrotista bajan el Ataque a la mitad', () => {
    near(outgoing('slow-start', 'tackle', { setup: (b) => void (A(b).slowStart = 5) }), 0.5);
    near(outgoing('slow-start', 'tackle'), 1);
    near(outgoing('defeatist', 'tackle', { setup: (b) => void (A(b).hp = Math.floor(A(b).maxHp / 2)) }), 0.5);
    near(outgoing('defeatist', 'tackle'), 1);
  });
  it('Latido Oricalco (sol, físico) y Motor Hadrónico (terreno eléctrico, especial): ×1,33', () => {
    near(outgoing('orichalcum-pulse', 'tackle', { setup: sun }), 4 / 3);
    near(outgoing('hadron-engine', 'psychic', { setup: (b) => void field(b, null, 'electric') }), 4 / 3);
    near(outgoing('hadron-engine', 'tackle', { setup: (b) => void field(b, null, 'electric') }), 1);
  });
  it('Protosíntesis e Impulso Cuark: ×1,3 en la estadística potenciada', () => {
    near(outgoing('protosynthesis', 'tackle', { setup: (b) => void (A(b).boosted = 'atk') }), 1.3);
    near(outgoing('quark-drive', 'psychic', { setup: (b) => void (A(b).boosted = 'spa') }), 1.3);
    near(outgoing('protosynthesis', 'psychic', { setup: (b) => void (A(b).boosted = 'atk') }), 1);
  });
  it('Señor Supremo: +10 % por cada aliado debilitado (hasta 5)', () => {
    near(outgoing('supreme-overlord', 'tackle', { setup: (b) => void (b.sides[0].faintedCount = 3) }), 1.3);
    near(outgoing('supreme-overlord', 'tackle', { setup: (b) => void (b.sides[0].faintedCount = 9) }), 1.5);
    near(outgoing('supreme-overlord', 'tackle'), 1);
  });
});

describe('rebajan al rival', () => {
  it('Espada de la Ruina y Cuentas de la Ruina bajan un 25 % la defensa que corresponde', () => {
    near(outgoing('sword-of-ruin', 'tackle'), 1 / 0.75);
    near(outgoing('sword-of-ruin', 'psychic'), 1);
    near(outgoing('beads-of-ruin', 'psychic'), 1 / 0.75);
    near(outgoing('beads-of-ruin', 'tackle'), 1);
  });
  it('Tablilla de la Ruina y Vasija de la Ruina bajan el ataque del rival un 25 %', () => {
    near(incoming('tablets-of-ruin', 'tackle'), 0.75);
    near(incoming('tablets-of-ruin', 'psychic'), 1);
    near(incoming('vessel-of-ruin', 'psychic'), 0.75);
    near(incoming('vessel-of-ruin', 'tackle'), 1);
  });
});

describe('auras', () => {
  it('Aura Oscura y Aura Feérica potencian sus ataques ×1,33 (sea quien sea el que ataque)', () => {
    near(outgoing('dark-aura', 'crunch'), 4 / 3);
    near(outgoing('fairy-aura', 'moonblast'), 4 / 3);
    near(outgoing('dark-aura', 'tackle'), 1);
    near(incoming('dark-aura', 'crunch'), 4 / 3); // el rival también sale beneficiado
  });
  it('Rompeaura invierte el efecto (×0,75)', () => {
    const make = (breaker: boolean) => duel(['snorlax', ['crunch'], 'dark-aura'], ['blissey', [NOOP], breaker ? 'aura-break' : undefined]);
    near(dmg(make(true), 'crunch') / dmg(make(false), 'crunch'), 0.75 / (4 / 3));
  });
  it('si los dos tienen el mismo aura no se aplica dos veces', () => {
    const both = duel(['snorlax', ['crunch'], 'dark-aura'], ['blissey', [NOOP], 'dark-aura']);
    const one = duel(['snorlax', ['crunch'], 'dark-aura'], ['blissey', [NOOP]]);
    expect(dmg(both, 'crunch')).toBe(dmg(one, 'crunch'));
  });
});

describe('reducen el daño que reciben', () => {
  const cases: [string, string, number, Parameters<typeof incoming>[2]?][] = [
    ['multiscale', 'tackle', 0.5], ['shadow-shield', 'tackle', 0.5],
    ['filter', 'surf', 0.75, { target: 'charizard' }], ['solid-rock', 'surf', 0.75, { target: 'charizard' }], ['prism-armor', 'surf', 0.75, { target: 'charizard' }],
    ['fur-coat', 'tackle', 0.5], ['ice-scales', 'psychic', 0.5], ['fluffy', 'tackle', 0.5], ['fluffy', 'flamethrower', 2, { attacker: 'alakazam', target: 'snorlax' }],
    ['heatproof', 'flamethrower', 0.5, { attacker: 'alakazam', target: 'snorlax' }], ['dry-skin', 'flamethrower', 1.25, { attacker: 'alakazam', target: 'snorlax' }], ['purifying-salt', 'shadow-ball', 0.5, { target: 'steelix' }], ['aura-guard', 'tackle', 0.5],
    ['punk-rock', 'hyper-voice', 0.5], ['water-bubble', 'flamethrower', 0.5, { attacker: 'alakazam', target: 'snorlax' }], ['thick-fat', 'flamethrower', 0.5, { attacker: 'alakazam', target: 'snorlax' }],
  ];
  for (const [ability, move, ratio, opts] of cases) {
    it(`${ability} frente a ${move}: ×${ratio}`, () => near(incoming(ability, move, opts), ratio));
  }
  it('Multiescamas solo con los PS completos', () => {
    near(incoming('multiscale', 'tackle', { setup: (b) => void (B(b).hp = B(b).maxHp - 1) }), 1);
  });
  it('Filtro y compañía no tocan los ataques que no son superefectivos', () => expect(incoming('filter', 'tackle')).toBeCloseTo(1, 1));
  it('Pelaje Hierba con el Terreno Herboso: ×1,5 la Defensa', () => {
    near(incoming('grass-pelt', 'tackle', { setup: (b) => void field(b, null, 'grassy') }), 1 / 1.5);
    near(incoming('grass-pelt', 'tackle'), 1);
  });
  it('Don Floral protege la Def. Esp. con sol', () => {
    near(incoming('flower-gift', 'psychic', { setup: sun }), 1 / 1.5);
  });
  it('Rompemoldes ignora las habilidades defensivas del objetivo', () => {
    const make = (attackerAbility?: string) => duel(['snorlax', ['tackle'], attackerAbility], ['blissey', [NOOP], 'multiscale']);
    near(dmg(make('mold-breaker'), 'tackle') / dmg(make(), 'tackle'), 2);
    near(dmg(make('teravolt'), 'tackle') / dmg(make(), 'tackle'), 2);
    near(dmg(make('turboblaze'), 'tackle') / dmg(make(), 'tackle'), 2);
  });
  it('...pero no las que no se pueden anular (Escudo Espectro)', () => {
    const make = (attackerAbility?: string) => duel(['snorlax', ['tackle'], attackerAbility], ['blissey', [NOOP], 'shadow-shield']);
    expect(dmg(make('mold-breaker'), 'tackle')).toBe(dmg(make(), 'tackle'));
  });
  it('Despiste ignora las mejoras del rival al atacar y al defender', () => {
    const attack = (own?: string) => {
      const b = duel(['snorlax', ['tackle'], own], ['blissey', [NOOP]]);
      B(b).stages.def = 6; // el rival se ha subido mucho la Defensa
      return dmg(b, 'tackle');
    };
    expect(attack('unaware')).toBeGreaterThan(attack() * 3);
    const defend = (ab?: string) => {
      const b = duel(['snorlax', ['tackle']], ['blissey', [NOOP], ab]);
      A(b).stages.atk = 6;
      return dmg(b, 'tackle');
    };
    expect(defend('unaware')).toBeLessThan(defend() / 3);
  });
  it('Humedad, Cuerpo Puro… (las anteriores) siguen igual', () => expect(incoming('marvel-scale', 'tackle')).toBeCloseTo(1, 1));
});

void rain;
