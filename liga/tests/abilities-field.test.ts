import { describe, expect, it } from 'vitest';
import { startBattle } from '../src/core/battle/engine';
import { describeEvent } from '../src/core/battle/log';
import { createBattle, activeOf, type Battle } from '../src/core/battle/state';
import { getAbility } from '../src/core/data';
import { A, B, abilityId, dmg, duel, field, has, makeSet, mv, scriptedRng, speed, sw, turn, types } from './helpers';

const NOOP = 'light-screen';
const HIT = [0, 0.99, 0.99];
const slug = (b: Battle, side: 0 | 1) => getAbility(activeOf(b, side).abilityId).slug;

/** Combate con `ability` en el bando 0, ya empezado (habilidades de entrada incluidas). */
function started(ability: string, foe: [string, string[], string?] = ['snorlax', [NOOP]], mine = 'snorlax'): Battle {
  const b = duel([mine, [NOOP], ability], foe);
  startBattle(b, scriptedRng([]));
  return b;
}

describe('provocan clima y terreno al entrar', () => {
  const cases: [string, string, string][] = [
    ['drizzle', 'weather', 'rain'], ['drought', 'weather', 'sun'], ['sand-stream', 'weather', 'sand'], ['snow-warning', 'weather', 'snow'],
    ['desolate-land', 'weather', 'harsh-sun'], ['primordial-sea', 'weather', 'heavy-rain'], ['delta-stream', 'weather', 'strong-winds'],
    ['orichalcum-pulse', 'weather', 'sun'], ['electric-surge', 'terrain', 'electric'], ['grassy-surge', 'terrain', 'grassy'],
    ['misty-surge', 'terrain', 'misty'], ['psychic-surge', 'terrain', 'psychic'], ['hadron-engine', 'terrain', 'electric'],
  ];
  for (const [ability, kind, value] of cases) {
    it(`${ability} → ${value}`, () => {
      const b = started(ability);
      expect(kind === 'weather' ? b.field.weather : b.field.terrain).toBe(value);
    });
  }
  it('Llovizna avisa en el registro', () => {
    const b = duel(['snorlax', [NOOP], 'drizzle'], ['blissey', [NOOP]]);
    const text = startBattle(b, scriptedRng([])).map((e) => describeEvent(e, 0));
    expect(text).toContain('Ha empezado a llover.');
  });
});

describe('velocidad', () => {
  const ratio = (ability: string, setup: (b: Battle) => void) => {
    const mk = (ab?: string) => {
      const b = duel(['snorlax', [NOOP], ab], ['blissey', [NOOP]]);
      setup(b);
      return speed(b);
    };
    return mk(ability) / mk();
  };
  it('Nado Rápido, Clorofila, Poder Arena, Quitanieves y Surcaolas duplican con su clima o terreno', () => {
    expect(ratio('swift-swim', (b) => void field(b, 'rain'))).toBe(2);
    expect(ratio('chlorophyll', (b) => void field(b, 'sun'))).toBe(2);
    expect(ratio('sand-rush', (b) => void field(b, 'sand'))).toBe(2);
    expect(ratio('slush-rush', (b) => void field(b, 'snow'))).toBe(2);
    expect(ratio('surge-surfer', (b) => void field(b, null, 'electric'))).toBe(2);
    expect(ratio('swift-swim', (b) => void field(b, 'sun'))).toBe(1);
  });
  it('Pies Rápidos: ×1,5 con un estado y la parálisis no la reduce', () => {
    expect(ratio('quick-feet', (b) => void (A(b).status = 'burn'))).toBe(1.5);
    const para = duel(['snorlax', [NOOP], 'quick-feet'], ['blissey', [NOOP]]);
    const none = duel(['snorlax', [NOOP]], ['blissey', [NOOP]]);
    A(para).status = 'paralysis';
    expect(speed(para)).toBe(Math.floor(speed(none) * 1.5));
  });
  it('Inicio Lento y Protosíntesis', () => {
    expect(ratio('slow-start', (b) => void (A(b).slowStart = 5))).toBe(0.5);
    expect(ratio('protosynthesis', (b) => void (A(b).boosted = 'spe'))).toBe(1.5);
  });
  it('Cielo Despejado (Nubosidad) anula los bonos de velocidad por clima', () => {
    const b = duel(['snorlax', [NOOP], 'swift-swim'], ['blissey', [NOOP], 'cloud-nine']);
    field(b, 'rain');
    const base = duel(['snorlax', [NOOP]], ['blissey', [NOOP]]);
    expect(speed(b)).toBe(speed(base));
  });
});

describe('orden de los ataques', () => {
  const firstSide = (ev: ReturnType<typeof turn>) => (ev.find((e) => e.type === 'move') as { side: 0 | 1 }).side;
  it('Bromista da prioridad a los ataques de estado y los Siniestros son inmunes', () => {
    const b = duel(['snorlax', ['swords-dance'], 'prankster'], ['jolteon', ['thunderbolt']]);
    expect(firstSide(turn(b, mv(0), mv(0), HIT))).toBe(0);
    const dark = duel(['snorlax', ['thunder-wave'], 'prankster'], ['umbreon', [NOOP]]);
    expect(types(turn(dark, mv(0), mv(0), [0]))).toContain('immune');
    expect(B(dark).status).toBeNull();
  });
  it('Alas Vendaval solo con los PS completos', () => {
    const full = duel(['snorlax', ['drill-peck'], 'gale-wings'], ['jolteon', ['thunderbolt']]);
    expect(firstSide(turn(full, mv(0), mv(0), HIT))).toBe(0);
    const hurt = duel(['snorlax', ['drill-peck'], 'gale-wings'], ['jolteon', ['thunderbolt']]);
    A(hurt).hp -= 1;
    expect(firstSide(turn(hurt, mv(0), mv(0), HIT))).toBe(1);
  });
  it('Médico: +3 de prioridad a los ataques que curan', () => {
    const b = duel(['snorlax', ['giga-drain'], 'triage'], ['jolteon', ['quick-attack']]);
    expect(firstSide(turn(b, mv(0), mv(0), HIT))).toBe(0);
  });
  it('Rezagado actúa el último; Mano Rápida a veces el primero', () => {
    const stall = duel(['jolteon', ['tackle'], 'stall'], ['snorlax', ['tackle']]);
    expect(firstSide(turn(stall, mv(0), mv(0), HIT))).toBe(1);
    const quick = duel(['snorlax', ['tackle'], 'quick-draw'], ['jolteon', ['tackle']]);
    expect(firstSide(turn(quick, mv(0), mv(0), [0.1, 0, 0.99, 0.99, 0, 0.99, 0.99]))).toBe(0);
    const no = duel(['snorlax', ['tackle'], 'quick-draw'], ['jolteon', ['tackle']]);
    expect(firstSide(turn(no, mv(0), mv(0), [0.9, 0, 0.99, 0.99, 0, 0.99, 0.99]))).toBe(1);
  });
  it('Poder Fúngico: sus ataques de estado van los últimos', () => {
    const b = duel(['jolteon', ['swords-dance'], 'mycelium-might'], ['snorlax', ['swords-dance']]);
    expect(firstSide(turn(b, mv(0), mv(0)))).toBe(1);
  });
});

describe('al final del turno', () => {
  const after = (ability: string, setup: (b: Battle) => void, foe: [string, string[], string?] = ['blissey', [NOOP]]) => {
    const b = duel(['snorlax', [NOOP], ability], foe);
    setup(b);
    turn(b, mv(0), mv(0));
    return b;
  };
  const low = (b: Battle) => void (A(b).hp = 1);
  it('Cura Lluvia, Cuerpo de Hielo y Piel Seca (lluvia) curan', () => {
    expect(A(after('rain-dish', (b) => (low(b), field(b, 'rain')))).hp).toBe(1 + Math.floor(235 / 16));
    expect(A(after('ice-body', (b) => (low(b), field(b, 'snow')))).hp).toBe(1 + Math.floor(235 / 16));
    expect(A(after('dry-skin', (b) => (low(b), field(b, 'rain')))).hp).toBe(1 + Math.floor(235 / 8));
    expect(A(after('rain-dish', low)).hp).toBe(1);
  });
  it('Piel Seca y Poder Solar con sol quitan 1/8', () => {
    expect(A(after('dry-skin', (b) => void field(b, 'sun'))).hp).toBe(235 - Math.floor(235 / 8));
    expect(A(after('solar-power', (b) => void field(b, 'sun'))).hp).toBe(235 - Math.floor(235 / 8));
  });
  it('Hidratación cura el estado con lluvia', () => {
    expect(A(after('hydration', (b) => ((A(b).status = 'burn'), field(b, 'rain')))).status).toBeNull();
    expect(A(after('hydration', (b) => void (A(b).status = 'burn'))).status).toBe('burn');
  });
  it('Antídoto: el veneno cura 1/8 en vez de dañar', () => {
    expect(A(after('poison-heal', (b) => ((A(b).status = 'poison'), low(b)))).hp).toBe(1 + Math.floor(235 / 8));
    expect(A(after('poison-heal', (b) => ((A(b).status = 'toxic'), low(b)))).hp).toBe(1 + Math.floor(235 / 8));
  });
  it('Guardia Mágica no sufre veneno ni quemadura ni retroceso', () => {
    expect(A(after('magic-guard', (b) => void (A(b).status = 'poison'))).hp).toBe(235);
    expect(A(after('magic-guard', (b) => void (A(b).status = 'burn'))).hp).toBe(235);
    const recoil = duel(['snorlax', ['double-edge'], 'magic-guard'], ['blissey', [NOOP]]);
    turn(recoil, mv(0), mv(0), HIT);
    expect(A(recoil).hp).toBe(A(recoil).maxHp);
  });
  it('Ignífugo reduce a la mitad el daño de la quemadura', () => {
    const b = duel(['snorlax', [NOOP], 'heatproof'], ['blissey', [NOOP]]);
    A(b).status = 'burn';
    turn(b, mv(0), mv(0));
    expect(A(b).hp).toBe(235 - Math.floor(235 / 32));
  });
  it('Veleidoso sube una estadística 2 niveles y baja otra 1', () => {
    const b = after('moody', () => undefined);
    const stages = Object.values(A(b).stages);
    expect(stages.filter((v) => v === 2)).toHaveLength(1);
    expect(stages.filter((v) => v === -1)).toHaveLength(1);
  });
  it('Pesadilla daña 1/8 a un rival dormido', () => {
    const b = after('bad-dreams', (x) => ((B(x).status = 'sleep'), (B(x).sleepTurns = 3)));
    expect(B(b).hp).toBe(B(b).maxHp - Math.floor(B(b).maxHp / 8));
    expect(B(after('bad-dreams', () => undefined)).hp).toBe(B(after('bad-dreams', () => undefined)).maxHp);
  });
  it('Mimetismo cambia el tipo con el terreno y lo recupera al acabar', () => {
    const b = duel(['snorlax', ['grassy-terrain', NOOP], 'mimicry'], ['blissey', [NOOP]]);
    turn(b, mv(0), mv(0));
    expect(A(b).types).toEqual(['grass']);
    for (let i = 0; i < 4; i++) turn(b, mv(1), mv(0));
    expect(b.field.terrain).toBeNull();
    expect(A(b).types).toEqual(['normal']);
  });
  it('Protosíntesis e Impulso Cuark potencian la mejor estadística mientras dure su condición', () => {
    const sun = duel(['alakazam', ['sunny-day', NOOP], 'protosynthesis'], ['blissey', [NOOP]]);
    turn(sun, mv(0), mv(0));
    expect(A(sun).boosted).toBe('spa'); // la más alta de Alakazam
    for (let i = 0; i < 5; i++) turn(sun, mv(1), mv(0));
    expect(b0(sun)).toBeNull();
    const quark = started('quark-drive', ['blissey', [NOOP]], 'alakazam');
    expect(A(quark).boosted).toBeNull();
    field(quark, null, 'electric');
    const eq = duel(['alakazam', [NOOP], 'quark-drive'], ['blissey', ['electric-terrain']]);
    turn(eq, mv(0), mv(0));
    expect(A(eq).boosted).toBe('spa');
  });
});
const b0 = (b: Battle) => A(b).boosted;

describe('Gas Reactivo', () => {
  it('anula las habilidades del rival mientras esté en el campo y las devuelve al irse', () => {
    const b = createBattle([makeSet('alakazam', ['earthquake'], abilityId('neutralizing-gas')), makeSet('blissey', [NOOP])], [makeSet('gengar', [NOOP], abilityId('levitate'))]);
    startBattle(b, scriptedRng([]));
    expect(B(b).suppressed).toBe(true);
    turn(b, mv(0), mv(0), HIT);
    expect(B(b).hp).toBeLessThan(B(b).maxHp); // Levitación no funciona
    turn(b, sw(1), mv(0));
    expect(B(b).suppressed).toBe(false);
  });
});

describe('al entrar en combate', () => {
  it('Calco copia la habilidad del rival (y la activa)', () => {
    const b = duel(['snorlax', [NOOP], 'trace'], ['gyarados', [NOOP], 'intimidate']);
    startBattle(b, scriptedRng([]));
    expect(slug(b, 0)).toBe('intimidate');
    expect(B(b).stages.atk).toBe(-1); // la habilidad copiada también actuó
    const none = duel(['snorlax', [NOOP], 'trace'], ['gengar', [NOOP], 'imposter']);
    startBattle(none, scriptedRng([]));
    expect(slug(none, 0)).toBe('trace'); // Impostor no se copia
  });
  it('Impostor se transforma en el rival: tipos, estadísticas (salvo PS), ataques con 5 PP y habilidad', () => {
    const b = duel(['snorlax', [NOOP], 'imposter'], ['gengar', ['shadow-ball', 'thunderbolt'], 'levitate']);
    const hp = A(b).maxHp;
    const ev = startBattle(b, scriptedRng([]));
    expect(A(b).types).toEqual(['ghost', 'poison']);
    expect(A(b).name).toBe('Gengar');
    expect(A(b).stats.spa).toBe(B(b).stats.spa);
    expect(A(b).maxHp).toBe(hp);
    expect(A(b).moves.map((m) => m.pp)).toEqual([5, 5]);
    expect(slug(b, 0)).toBe('levitate');
    expect(has(ev, (e) => e.type === 'transform')).toBe(true);
  });
  it('Impostor vuelve a la normalidad al retirarse', () => {
    const b = createBattle([makeSet('snorlax', [NOOP], abilityId('imposter')), makeSet('blissey', [NOOP])], [makeSet('gengar', [NOOP])]);
    const spa = b.sides[0].team[0]!.stats.spa;
    startBattle(b, scriptedRng([]));
    expect(A(b).name).toBe('Gengar');
    turn(b, sw(1), mv(0));
    const back = b.sides[0].team[0]!;
    expect(back.name).toBe('Snorlax');
    expect(back.types).toEqual(['normal']);
    expect(back.stats.spa).toBe(spa);
    expect(getAbility(back.abilityId).slug).toBe('imposter');
    expect(back.transformBackup).toBeNull();
  });
  it('Descarga sube el Ataque o el At. Esp. según la defensa más baja del rival', () => {
    const phys = started('download', ['snorlax', [NOOP]], 'alakazam'); // Snorlax: Def 65 < Def. Esp. 110
    expect(A(phys).stages.atk).toBe(1);
    const spec = started('download', ['alakazam', [NOOP]], 'snorlax'); // Alakazam: Def 45 < Def. Esp. 95
    expect(A(spec).stages.atk).toBe(1);
    const spec2 = started('download', ['blissey', [NOOP]], 'snorlax'); // Blissey: Def 10 < Def. Esp. 135
    expect(A(spec2).stages.atk).toBe(1);
  });
  it('Inicio Lento: 5 turnos con la mitad de Ataque y Velocidad, y luego se pasa', () => {
    const b = started('slow-start');
    expect(A(b).slowStart).toBe(5);
    for (let i = 0; i < 5; i++) turn(b, mv(0), mv(0));
    expect(A(b).slowStart).toBe(0);
  });
  it('Néctar Dulce, Espada Intrépida y Escudo Recio actúan solo la primera vez que entra', () => {
    const b = createBattle([makeSet('snorlax', [NOOP], abilityId('supersweet-syrup')), makeSet('blissey', [NOOP])], [makeSet('alakazam', [NOOP])]);
    startBattle(b, scriptedRng([]));
    expect(B(b).stages.eva).toBe(-1);
    turn(b, sw(1), mv(0));
    turn(b, sw(0), mv(0));
    expect(B(b).stages.eva).toBe(-1); // no se repite
    expect(A(started('intrepid-sword')).stages.atk).toBe(1);
    expect(A(started('dauntless-shield')).stages.def).toBe(1);
  });
  it('Anticipación y Presagio avisan', () => {
    const warn = (ability: string, foe: [string, string[]]) => {
      const b = duel(['snorlax', [NOOP], ability], foe);
      return startBattle(b, scriptedRng([])).filter((e) => e.type === 'ability' && e.side === 0).length;
    };
    expect(warn('anticipation', ['alakazam', ['karate-chop']])).toBe(1); // lucha: superefectivo contra Normal
    expect(warn('anticipation', ['alakazam', ['psychic']])).toBe(0);
    expect(warn('forewarn', ['alakazam', ['psychic']])).toBe(1);
  });
  it('Regeneración cura 1/3 al retirarse', () => {
    const b = createBattle([makeSet('snorlax', [NOOP], abilityId('regenerator')), makeSet('blissey', [NOOP])], [makeSet('alakazam', [NOOP])]);
    A(b).hp = 1;
    turn(b, sw(1), mv(0));
    expect(b.sides[0].team[0]!.hp).toBe(1 + Math.floor(235 / 3));
  });
});

describe('precisión, golpes y críticos', () => {
  it('Sin Guardia: sus ataques y los que recibe nunca fallan', () => {
    const miss = (att?: string, def?: string) => types(turn(duel(['alakazam', ['thunder'], att], ['snorlax', [NOOP], def]), mv(0), mv(0), [0.95, 0.99, 0.99])).includes('miss');
    expect(miss()).toBe(true);
    expect(miss('no-guard')).toBe(false);
    expect(miss(undefined, 'no-guard')).toBe(false);
  });
  it('Estrella de la Victoria sube la precisión un 10 %; Velo Arena y Nieve Normal bajan la que reciben', () => {
    // Trueno (70 %): con una tirada de 0,75 falla; con Estrella de la Victoria (77 %) acierta
    const t = (att?: string, def?: string, setup?: (b: Battle) => void) => {
      const b = duel(['alakazam', ['thunder'], att], ['snorlax', [NOOP], def]);
      setup?.(b);
      return types(turn(b, mv(0), mv(0), [0.75, 0.99, 0.99])).includes('miss');
    };
    expect(t()).toBe(true);
    expect(t('victory-star')).toBe(false);
    expect(t(undefined, 'sand-veil', (b) => void field(b, 'sand'))).toBe(true);
  });
  it('Encadenado (Multi-golpe): Doble Ataque siempre da el máximo de golpes', () => {
    const normal = duel(['snorlax', ['fury-swipes']], ['blissey', [NOOP]]);
    const ev = turn(normal, mv(0), mv(0), [0, 0.1, ...Array(12).fill(0.99)]);
    expect(ev.find((e) => e.type === 'hits')).toMatchObject({ count: 2 });
    const skill = duel(['snorlax', ['fury-swipes'], 'skill-link'], ['blissey', [NOOP]]);
    expect(turn(skill, mv(0), mv(0), [0, 0.1, ...Array(12).fill(0.99)]).find((e) => e.type === 'hits')).toMatchObject({ count: 5 });
  });
  it('Afortunado sube el crítico un nivel; Despiadado siempre critica a un envenenado', () => {
    const crit = (ab?: string, setup?: (b: Battle) => void) => {
      const b = duel(['alakazam', ['psychic'], ab], ['snorlax', [NOOP]]);
      setup?.(b);
      return types(turn(b, mv(0), mv(0), [0, 0.1, 0.99])).includes('crit');
    };
    expect(crit()).toBe(false); // 0,1 > 1/16
    expect(crit('super-luck')).toBe(true); // 0,1 < 1/8
    expect(crit('merciless')).toBe(false);
    expect(crit('merciless', (b) => void (B(b).status = 'poison'))).toBe(true);
  });
  it('Amor Filial: un segundo golpe más débil (25 %)', () => {
    const b = duel(['snorlax', ['tackle'], 'parental-bond'], ['blissey', [NOOP]]);
    const ev = turn(b, mv(0), mv(0), [0, 0.99, 0.99, 0.99, 0.99]);
    const hits = ev.filter((e) => e.type === 'damage' && e.cause === 'move') as { amount: number }[];
    expect(hits).toHaveLength(2);
    expect(hits[1]!.amount).toBeGreaterThan(0);
    expect(hits[1]!.amount / hits[0]!.amount).toBeLessThan(0.3);
    expect(ev.find((e) => e.type === 'hits')).toMatchObject({ count: 2 });
  });
  it('Megasolar trata el clima como sol para sus ataques', () => {
    const mk = (ab?: string) => duel(['alakazam', ['flamethrower'], ab], ['snorlax', [NOOP]]);
    expect(dmg(mk('mega-sol'), 'flamethrower') / dmg(mk(), 'flamethrower')).toBeCloseTo(1.5, 1);
  });
  it('Estela Reflejo… Hedor: 10 % de retroceso extra', () => {
    const b = duel(['alakazam', ['tackle'], 'stench'], ['snorlax', ['tackle']]);
    const ev = turn(b, mv(0), mv(0), [0, 0.99, 0.99, 0.05]);
    expect(has(ev, (e) => e.type === 'cantMove' && e.reason === 'flinch' && e.side === 1)).toBe(true);
  });
  it('Bailarín copia los bailes del rival', () => {
    const b = duel(['alakazam', ['swords-dance']], ['snorlax', [NOOP], 'dancer']);
    turn(b, mv(0), mv(0));
    expect(A(b).stages.atk).toBe(2);
    expect(B(b).stages.atk).toBe(2);
  });
  it('Corrosión envenena a los Acero; Títere Tóxico confunde al envenenado', () => {
    const toxic = (ab?: string) => {
      const b = duel(['alakazam', ['toxic'], ab], ['steelix', [NOOP]]);
      turn(b, mv(0), mv(0), [0]);
      return B(b);
    };
    expect(toxic().status).toBeNull();
    expect(toxic('corrosion').status).toBe('toxic');
    const pup = duel(['alakazam', ['toxic'], 'poison-puppeteer'], ['snorlax', [NOOP]]);
    turn(pup, mv(0), mv(0), [0]);
    expect([B(pup).status, B(pup).confused > 0]).toEqual(['toxic', true]);
  });
});

describe('cambios de tipo', () => {
  const type = (ability: string, move: string) => turn(duel(['alakazam', [move], ability], ['blissey', [NOOP]]), mv(0), mv(0), HIT).find((e) => e.type === 'move' && e.side === 0) as { moveType: string };
  it('Piel Celeste, Piel Feérica, Piel Helada, Electrogénesis y Piel Dragontina cambian el tipo Normal', () => {
    expect(type('aerilate', 'tackle').moveType).toBe('flying');
    expect(type('pixilate', 'tackle').moveType).toBe('fairy');
    expect(type('refrigerate', 'tackle').moveType).toBe('ice');
    expect(type('galvanize', 'tackle').moveType).toBe('electric');
    expect(type('dragonize', 'tackle').moveType).toBe('dragon');
    expect(type('aerilate', 'psychic').moveType).toBe('psychic');
  });
  it('...con un 20 % más de potencia', () => {
    const mk = (ab?: string) => duel(['alakazam', ['tackle'], ab], ['blissey', [NOOP]]);
    expect(dmg(mk('pixilate'), 'tackle') / dmg(mk(), 'tackle')).toBeCloseTo(1.2, 1);
  });
  it('Normalidad convierte todo en Normal y Voz Fluida los sonidos en Agua', () => {
    expect(type('normalize', 'psychic').moveType).toBe('normal');
    expect(type('liquid-voice', 'hyper-voice').moveType).toBe('water');
    expect(type('liquid-voice', 'psychic').moveType).toBe('psychic');
  });
  it('Líbero y Mutatipo: el Pokémon adopta el tipo de su ataque, una vez por entrada', () => {
    for (const ability of ['protean', 'libero']) {
      const b = duel(['alakazam', ['flamethrower', 'surf'], ability], ['blissey', [NOOP]]);
      const ev = turn(b, mv(0), mv(0), HIT);
      expect(A(b).types, ability).toEqual(['fire']);
      expect(has(ev, (e) => e.type === 'types')).toBe(true);
      turn(b, mv(1), mv(0), HIT);
      expect(A(b).types, `${ability} no cambia otra vez`).toEqual(['fire']);
    }
  });
});

void getAbility;
