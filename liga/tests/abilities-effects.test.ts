import { describe, expect, it } from 'vitest';
import { sendOut, startBattle } from '../src/core/battle/engine';
import { createBattle, activeOf, type Battle } from '../src/core/battle/state';
import { getAbility } from '../src/core/data';
import { A, B, abilityId, dmg, duel, field, has, makeSet, mv, scriptedRng, sw, turn, types } from './helpers';

const NOOP = 'light-screen';
const HIT = [0, 0.99, 0.99];
type Setup = (b: Battle) => void;

/** Alakazam (rápido) usa `move` contra un Snorlax con `ability`; devuelve el combate y los eventos del turno. */
function hit(ability: string, move: string, opts: { attacker?: string; target?: string; setup?: Setup; rolls?: number[]; attackerAbility?: string } = {}) {
  const b = duel([opts.attacker ?? 'alakazam', [move], opts.attackerAbility], [opts.target ?? 'snorlax', [NOOP], ability]);
  opts.setup?.(b);
  const ev = turn(b, mv(0), mv(0), opts.rolls ?? HIT);
  return { b, ev };
}
const untouched = (b: Battle) => B(b).hp === B(b).maxHp;

describe('absorben o anulan ataques', () => {
  const absorbs: [string, string, (b: Battle) => void][] = [
    ['motor-drive', 'thunderbolt', (b) => expect(B(b).stages.spe).toBe(1)],
    ['sap-sipper', 'razor-leaf', (b) => expect(B(b).stages.atk).toBe(1)],
    ['storm-drain', 'surf', (b) => expect(B(b).stages.spa).toBe(1)],
    ['well-baked-body', 'ember', (b) => expect(B(b).stages.def).toBe(2)],
    ['wind-rider', 'gust', (b) => expect(B(b).stages.atk).toBe(1)],
  ];
  for (const [ability, move, check] of absorbs) {
    it(`${ability} absorbe ${move} y sube una estadística`, () => {
      const { b, ev } = hit(ability, move);
      expect(untouched(b)).toBe(true);
      check(b);
      expect(has(ev, (e) => e.type === 'ability')).toBe(true);
    });
  }

  it('Piel Seca y Comedor de Tierra absorben y curan 1/4', () => {
    for (const [ability, move] of [['dry-skin', 'surf'], ['earth-eater', 'earthquake']] as const) {
      const { b } = hit(ability, move, { setup: (x) => void (B(x).hp = Math.floor(B(x).maxHp / 2)) });
      expect(B(b).hp, ability).toBe(Math.floor(B(b).maxHp / 2) + Math.floor(B(b).maxHp / 4));
    }
  });

  it('Antibalas, Funda y Cuerpo Áureo anulan ataques concretos', () => {
    expect(untouched(hit('bulletproof', 'shadow-ball').b)).toBe(true);
    expect(hit('overcoat', 'sleep-powder').b.sides[1].team[0]!.status).toBeNull();
    expect(hit('good-as-gold', 'thunder-wave').b.sides[1].team[0]!.status).toBeNull();
    // Cuerpo Áureo solo anula los ataques de estado
    expect(untouched(hit('good-as-gold', 'psychic').b)).toBe(false);
  });

  it('Reina Majestuosa, Cuerpo Seductor y Cola Armadura impiden los ataques con prioridad', () => {
    for (const ability of ['queenly-majesty', 'dazzling', 'armor-tail']) {
      const { b } = hit(ability, 'quick-attack');
      expect(untouched(b), ability).toBe(true);
      expect(untouched(hit(ability, 'psychic').b), `${ability} deja pasar lo demás`).toBe(false);
    }
  });

  it('Eleva anula los ataques de tierra', () => expect(untouched(hit('eelevate', 'earthquake').b)).toBe(true));

  it('Espejo Mágico devuelve los ataques de estado rebotables', () => {
    const { b } = hit('magic-bounce', 'thunder-wave', { rolls: [0] });
    expect(A(b).status).toBe('paralysis');
    expect(B(b).status).toBeNull();
  });

  it('Disfraz anula el primer golpe y quita 1/8 de PS; después recibe daño normal', () => {
    const b = duel(['alakazam', ['psychic']], ['snorlax', [NOOP], 'disguise']);
    const ev = turn(b, mv(0), mv(0), HIT);
    expect(B(b).disguiseBroken).toBe(true);
    expect(B(b).hp).toBe(B(b).maxHp - Math.floor(B(b).maxHp / 8));
    expect(ev.find((e) => e.type === 'damage')).toMatchObject({ cause: 'disguise' });
    turn(b, mv(0), mv(0), HIT);
    expect(B(b).hp).toBeLessThan(B(b).maxHp - Math.floor(B(b).maxHp / 8) - 20);
  });

  it('Cara de Hielo anula el primer golpe físico y se recupera con nieve', () => {
    const phys = duel(['snorlax', ['tackle']], ['blissey', [NOOP], 'ice-face']);
    turn(phys, mv(0), mv(0), HIT);
    expect(untouched(phys)).toBe(true);
    expect(B(phys).iceFaceBroken).toBe(true);
    const special = duel(['alakazam', ['psychic']], ['snorlax', [NOOP], 'ice-face']);
    turn(special, mv(0), mv(0), HIT);
    expect(untouched(special)).toBe(false);
    expect(B(special).iceFaceBroken).toBe(false);
    // con nieve recupera la cara
    const snow = duel(['alakazam', ['snowscape']], ['snorlax', [NOOP], 'ice-face']);
    B(snow).iceFaceBroken = true;
    turn(snow, mv(0), mv(0));
    expect(B(snow).iceFaceBroken).toBe(false);
  });

  it('Rompemoldes atraviesa Levitación, y Poder Fúngico los ataques de estado de Cuerpo Áureo', () => {
    expect(untouched(hit('levitate', 'earthquake', { attackerAbility: 'mold-breaker' }).b)).toBe(false);
    expect(untouched(hit('levitate', 'earthquake').b)).toBe(true);
    expect(hit('good-as-gold', 'thunder-wave', { attackerAbility: 'mycelium-might', rolls: [0] }).b.sides[1].team[0]!.status).toBe('paralysis');
  });
});

describe('Intimidación y estados', () => {
  const intimidated = (ability: string) => {
    const b = createBattle([makeSet('gyarados', [NOOP], abilityId('intimidate'))], [makeSet('snorlax', [NOOP], abilityId(ability))]);
    startBattle(b, scriptedRng([]));
    return B(b).stages;
  };
  it('Ritmo Propio, Despiste, Escurridizo y Foco Interno son inmunes', () => {
    for (const ability of ['own-tempo', 'oblivious', 'scrappy', 'inner-focus']) expect(intimidated(ability).atk, ability).toBe(0);
    expect(intimidated('illuminate').atk).toBe(-1);
  });
  it('Perro Guardián sube el Ataque y Nerviosismo la Velocidad', () => {
    expect(intimidated('guard-dog').atk).toBe(1);
    expect(intimidated('rattled')).toMatchObject({ atk: 0, spe: 1 });
  });

  it('Velo Dulce, Velo Pastel, Sal Purificadora y Coma impiden estados', () => {
    const status = (ability: string, move: string) => hit(ability, move, { rolls: [0] }).b.sides[1].team[0]!.status;
    expect(status('sweet-veil', 'hypnosis')).toBeNull();
    expect(status('sweet-veil', 'thunder-wave')).toBe('paralysis');
    expect(status('pastel-veil', 'toxic')).toBeNull();
    expect(status('purifying-salt', 'thunder-wave')).toBeNull();
    expect(status('comatose', 'will-o-wisp')).toBeNull();
    expect(status('thermal-exchange', 'will-o-wisp')).toBeNull();
    expect(status('water-bubble', 'will-o-wisp')).toBeNull();
  });
  it('Defensa Hoja protege con sol, y solo entonces', () => {
    const sun = hit('leaf-guard', 'thunder-wave', { rolls: [0], setup: (b) => void field(b, 'sun') }).b;
    expect(B(sun).status).toBeNull();
    expect(hit('leaf-guard', 'thunder-wave', { rolls: [0] }).b.sides[1].team[0]!.status).toBe('paralysis');
  });
  it('Intercambio Térmico sube el Ataque al recibir fuego', () => expect(B(hit('thermal-exchange', 'ember').b).stages.atk).toBe(1));
  it('Comatoso, Sal Purificadora… no bloquean los ataques de daño', () => expect(untouched(hit('comatose', 'psychic').b)).toBe(false));
});

describe('estadísticas', () => {
  it('Pico Pegajoso / Cuerpo Metálico / Armadura Espejo frente a las bajadas', () => {
    expect(B(hit('big-pecks', 'screech', { rolls: [0] }).b).stages.def).toBe(0);
    expect(B(hit('full-metal-body', 'growl').b).stages.atk).toBe(0);
    const mirror = hit('mirror-armor', 'growl').b;
    expect(B(mirror).stages.atk).toBe(0);
    expect(A(mirror).stages.atk).toBe(-1);
  });
  it('Respondón invierte y Simple duplica los cambios de estadística', () => {
    expect(B(hit('contrary', 'growl').b).stages.atk).toBe(1);
    expect(B(hit('simple', 'growl').b).stages.atk).toBe(-2);
    const self = duel(['snorlax', ['swords-dance'], 'simple'], ['blissey', [NOOP]]);
    turn(self, mv(0), mv(0));
    expect(A(self).stages.atk).toBe(4);
  });
  it('Rebeldía y Competitivo suben mucho tras una bajada del rival', () => {
    expect(B(hit('defiant', 'growl').b).stages.atk).toBe(1); // -1 y +2
    expect(B(hit('competitive', 'growl').b).stages.spa).toBe(2);
  });
  it('Oportunista copia las mejoras del rival', () => {
    const b = duel(['alakazam', ['swords-dance']], ['snorlax', [NOOP], 'opportunist']);
    turn(b, mv(0), mv(0));
    expect(A(b).stages.atk).toBe(2);
    expect(B(b).stages.atk).toBe(2);
  });
  it('Impasible: si retrocede, sube la Velocidad', () => {
    const { b } = hit('steadfast', 'fake-out', { rolls: [0, 0.99, 0.99] });
    expect(B(b).stages.spe).toBe(1);
  });
});

describe('reaccionan al recibir un golpe', () => {
  const reacts: [string, string, (b: Battle) => void, Parameters<typeof hit>[2]?][] = [
    ['rattled', 'x-scissor', (b) => expect(B(b).stages.spe).toBe(1)],
    ['justified', 'crunch', (b) => expect(B(b).stages.atk).toBe(1)],
    ['stamina', 'psychic', (b) => expect(B(b).stages.def).toBe(1)],
    ['water-compaction', 'surf', (b) => expect(B(b).stages.def).toBe(2)],
    ['steam-engine', 'flamethrower', (b) => expect(B(b).stages.spe).toBe(6)],
    ['cotton-down', 'psychic', (b) => expect(A(b).stages.spe).toBe(-1)],
    ['seed-sower', 'psychic', (b) => expect(b.field.terrain).toBe('grassy')],
    ['sand-spit', 'psychic', (b) => expect(b.field.weather).toBe('sand')],
    ['electromorphosis', 'psychic', (b) => expect(B(b).charged).toBe(true)],
    ['wind-power', 'gust', (b) => expect(B(b).charged).toBe(true)],
  ];
  for (const [ability, move, check, opts] of reacts) {
    it(`${ability} tras recibir ${move}`, () => check(hit(ability, move, opts).b));
  }

  it('Armadura Frágil: un golpe físico baja la Defensa y sube mucho la Velocidad', () => {
    const { b } = hit('weak-armor', 'tackle', { attacker: 'snorlax' });
    expect([B(b).stages.def, B(b).stages.spe]).toEqual([-1, 2]);
    expect(B(hit('weak-armor', 'psychic').b).stages.def).toBe(0);
  });

  it('Punto de Furia: un crítico sube el Ataque al máximo', () => {
    const { b } = hit('anger-point', 'psychic', { rolls: [0, 0, 0.99] });
    expect(B(b).stages.atk).toBe(6);
    expect(B(hit('anger-point', 'psychic').b).stages.atk).toBe(0);
  });

  it('Rabia y Cáscara Furiosa se activan al cruzar el 50 % de PS', () => {
    const below = (x: Battle) => void (B(x).hp = Math.floor(B(x).maxHp * 0.51));
    expect(B(hit('berserk', 'psychic', { setup: below }).b).stages.spa).toBe(1);
    expect(B(hit('berserk', 'psychic').b).stages.spa).toBe(0); // con la vida completa no cruza
    const shell = hit('anger-shell', 'psychic', { setup: below }).b;
    expect([B(shell).stages.atk, B(shell).stages.spa, B(shell).stages.spe, B(shell).stages.def, B(shell).stages.spd]).toEqual([1, 1, 1, -1, -1]);
  });

  it('Dinamo carga y el siguiente ataque eléctrico hace el doble (y se gasta)', () => {
    const b = duel(['alakazam', ['psychic']], ['snorlax', [NOOP, 'thunderbolt'], 'electromorphosis']);
    turn(b, mv(0), mv(0), HIT); // recibe el golpe y queda cargado (usa Pantalla de Luz, que no es eléctrico)
    expect(B(b).charged).toBe(true);
    const charged = dmg(b, 'thunderbolt', { side: 1 });
    B(b).charged = false;
    expect(charged / dmg(b, 'thunderbolt', { side: 1 })).toBeGreaterThan(1.9);
    B(b).charged = true;
    turn(b, mv(0), mv(1), HIT); // usa Rayo: gasta la carga
    expect(B(b).charged).toBe(false); // se gastó (y el golpe de Alakazam lo volvió a cargar solo si ocurrió después)
  });

  it('Retirada y Huida de Emergencia: al bajar del 50 % piden relevo al final del turno', () => {
    for (const ability of ['wimp-out', 'emergency-exit']) {
      const b = createBattle([makeSet('alakazam', ['psychic'])], [makeSet('snorlax', [NOOP], abilityId(ability)), makeSet('blissey', [NOOP])]);
      B(b).hp = Math.floor(B(b).maxHp * 0.51);
      turn(b, mv(0), mv(0), HIT);
      expect(b.pending[1], ability).toBe(true);
      const out = sendOut(b, 1, 1, scriptedRng([]));
      expect(types(out), ability).toEqual(expect.arrayContaining(['recall', 'switch']));
      expect(B(b).name).toBe('Blissey');
      expect(b.pending).toEqual([false, false]);
    }
  });
  it('...y no si no hay compañeros que entren', () => {
    const b = duel(['alakazam', ['psychic']], ['snorlax', [NOOP], 'wimp-out']);
    B(b).hp = Math.floor(B(b).maxHp * 0.51);
    turn(b, mv(0), mv(0), HIT);
    expect(b.pending[1]).toBe(false);
  });
});

describe('reaccionan al contacto', () => {
  const contact = (ability: string, opts: { rolls?: number[] } = {}) => hit(ability, 'tackle', { attacker: 'snorlax', rolls: opts.rolls ?? HIT, target: 'blissey' }).b;

  it('Salpicante quema, Púas Hierro hiere, Pegajoso y Pelo Enredado bajan la Velocidad', () => {
    expect(A(contact('spicy-spray')).status).toBe('burn');
    expect(A(contact('iron-barbs')).hp).toBe(A(contact('iron-barbs')).maxHp - Math.floor(A(contact('iron-barbs')).maxHp / 8));
    expect(A(contact('gooey')).stages.spe).toBe(-1);
    expect(A(contact('tangling-hair')).stages.spe).toBe(-1);
  });
  it('Momia y Olor Persistente contagian su habilidad; Espíritu Errante la intercambia', () => {
    const slug = (b: Battle, side: 0 | 1) => getAbility(activeOf(b, side).abilityId).slug;
    expect(slug(contact('mummy'), 0)).toBe('mummy');
    expect(slug(contact('lingering-aroma'), 0)).toBe('lingering-aroma');
    const swap = contact('wandering-spirit');
    expect(slug(swap, 0)).toBe('wandering-spirit');
    expect(slug(swap, 1)).toBe('illuminate');
  });
  it('Toque Tóxico y Cadena Tóxica envenenan al rival (30 %)', () => {
    const touch = hit('illuminate', 'tackle', { attacker: 'snorlax', attackerAbility: 'poison-touch', rolls: [0, 0.99, 0.99, 0.1], target: 'blissey' }).b;
    expect(B(touch).status).toBe('poison');
    const chain = hit('illuminate', 'psychic', { attackerAbility: 'toxic-chain', rolls: [0, 0.99, 0.99, 0.1] }).b;
    expect(B(chain).status).toBe('toxic');
    const none = hit('illuminate', 'psychic', { attackerAbility: 'toxic-chain', rolls: [0, 0.99, 0.99, 0.9] }).b;
    expect(B(none).status).toBeNull();
  });
  it('Alcance Largo: sus ataques no hacen contacto', () => {
    const rolls = [0, 0.99, 0.99, 0.1];
    expect(A(hit('static', 'tackle', { attacker: 'snorlax', target: 'blissey', rolls }).b).status).toBe('paralysis');
    expect(A(hit('static', 'tackle', { attacker: 'snorlax', target: 'blissey', rolls, attackerAbility: 'long-reach' }).b).status).toBeNull();
  });
});

describe('al debilitarse o debilitar', () => {
  it('Efecto Dominó: el que lo debilita con un ataque de contacto pierde 1/4', () => {
    const b = duel(['snorlax', ['tackle']], ['blissey', [NOOP], 'aftermath']);
    B(b).hp = 1;
    turn(b, mv(0), mv(0), HIT);
    expect(A(b).hp).toBe(A(b).maxHp - Math.floor(A(b).maxHp / 4));
    const far = duel(['alakazam', ['psychic']], ['blissey', [NOOP], 'aftermath']);
    B(far).hp = 1;
    turn(far, mv(0), mv(0), HIT);
    expect(A(far).hp).toBe(A(far).maxHp); // sin contacto no hay daño
  });
  it('Entrañas: le devuelve el daño del golpe final', () => {
    const b = duel(['alakazam', ['psychic']], ['snorlax', [NOOP], 'innards-out']);
    B(b).hp = 17;
    turn(b, mv(0), mv(0), HIT);
    expect(A(b).hp).toBe(A(b).maxHp - 17);
  });
  const knockOuts: [string, string, (b: Battle) => void][] = [
    ['moxie', 'psychic', (b) => expect(A(b).stages.atk).toBe(1)],
    ['chilling-neigh', 'psychic', (b) => expect(A(b).stages.atk).toBe(1)],
    ['grim-neigh', 'psychic', (b) => expect(A(b).stages.spa).toBe(1)],
    ['as-one-glastrier', 'psychic', (b) => expect(A(b).stages.atk).toBe(1)],
    ['as-one-spectrier', 'psychic', (b) => expect(A(b).stages.spa).toBe(1)],
    ['beast-boost', 'psychic', (b) => expect(A(b).stages.spa).toBe(1)], // su mejor estadística
    ['soul-heart', 'psychic', (b) => expect(A(b).stages.spa).toBe(1)],
  ];
  for (const [ability, move, check] of knockOuts) {
    it(`${ability} tras debilitar`, () => {
      const b = createBattle([makeSet('alakazam', [move], abilityId(ability))], [makeSet('snorlax', [NOOP]), makeSet('blissey', [NOOP])]);
      B(b).hp = 1;
      turn(b, mv(0), mv(0), HIT);
      check(b);
    });
  }
});

void sw; void field;
