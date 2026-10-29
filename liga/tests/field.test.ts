import { describe, expect, it } from 'vitest';
import { effectiveWeather, isGrounded } from '../src/core/battle/field';
import { describeEvent } from '../src/core/battle/log';
import { statusBlock } from '../src/core/battle/ops';
import { A, B, abilityId, dmg, duel, field, has, makeSet, moveId, mv, scriptedRng, sw, turn, types } from './helpers';
import { createBattle, activeOf } from '../src/core/battle/state';
import { executeTurn, sendOut, startBattle } from '../src/core/battle/engine';

const NOOP = 'light-screen';

describe('clima: ataques que lo provocan', () => {
  it('Danza Lluvia, Día Soleado, Tormenta Arena y Granizo cambian el clima y avisan', () => {
    const cases: [string, string, string][] = [
      ['rain-dance', 'rain', 'Ha empezado a llover.'],
      ['sunny-day', 'sun', 'Hace mucho sol.'],
      ['sandstorm', 'sand', 'Se levanta una tormenta de arena.'],
      ['hail', 'snow', 'Empieza a nevar.'],
      ['snowscape', 'snow', 'Empieza a nevar.'],
    ];
    for (const [move, weather, text] of cases) {
      const b = duel(['alakazam', [move]], ['snorlax', [NOOP]]);
      const ev = turn(b, mv(0), mv(0));
      expect(b.field.weather, move).toBe(weather);
      expect(b.field.weatherTurns).toBeGreaterThan(0);
      expect(ev.map((e) => describeEvent(e, 0))).toContain(text);
    }
  });

  it('dura 5 turnos y luego se acaba avisando', () => {
    const b = duel(['alakazam', ['rain-dance', NOOP]], ['snorlax', [NOOP]]);
    turn(b, mv(0), mv(0)); // turno 1: empieza (quedan 4 tras el final de turno)
    for (let i = 0; i < 3; i++) turn(b, mv(1), mv(0));
    expect(b.field.weather).toBe('rain');
    const ev = turn(b, mv(1), mv(0));
    expect(b.field.weather).toBeNull();
    expect(ev.map((e) => describeEvent(e, 0))).toContain('Ha dejado de llover.');
  });

  it('repetir el mismo clima falla', () => {
    const b = duel(['alakazam', ['rain-dance']], ['snorlax', [NOOP]]);
    turn(b, mv(0), mv(0));
    expect(types(turn(b, mv(0), mv(0)))).toContain('failed');
  });
});

describe('clima: efectos', () => {
  it('sol: Fuego ×1,5 y Agua ×0,5; lluvia, al revés', () => {
    const mk = (w: 'sun' | 'rain' | null) => field(duel(['alakazam', ['flamethrower', 'surf']], ['blissey', [NOOP]]), w);
    const base = mk(null);
    const fire = dmg(base, 'flamethrower');
    const water = dmg(base, 'surf');
    expect(dmg(mk('sun'), 'flamethrower') / fire).toBeCloseTo(1.5, 1);
    expect(dmg(mk('sun'), 'surf') / water).toBeCloseTo(0.5, 1);
    expect(dmg(mk('rain'), 'surf') / water).toBeCloseTo(1.5, 1);
    expect(dmg(mk('rain'), 'flamethrower') / fire).toBeCloseTo(0.5, 1);
  });

  it('sol extremo y diluvio anulan los ataques contrarios', () => {
    const sun = field(duel(['alakazam', ['surf']], ['blissey', [NOOP]]), 'harsh-sun');
    expect(types(turn(sun, mv(0), mv(0)))).toContain('failed');
    expect(B(sun).hp).toBe(B(sun).maxHp);
    const rain = field(duel(['alakazam', ['flamethrower']], ['blissey', [NOOP]]), 'heavy-rain');
    expect(types(turn(rain, mv(0), mv(0)))).toContain('failed');
  });

  it('tormenta de arena: daña 1/16 salvo a Roca, Tierra y Acero, y a quien tiene Visión de Arena o Garra de Acero', () => {
    const b = field(duel(['alakazam', [NOOP]], ['snorlax', [NOOP]]), 'sand');
    const ev = turn(b, mv(0), mv(0));
    expect(A(b).hp).toBe(A(b).maxHp - Math.floor(A(b).maxHp / 16));
    expect(B(b).hp).toBe(B(b).maxHp - Math.floor(B(b).maxHp / 16));
    expect(ev.filter((e) => e.type === 'damage' && e.cause === 'weather')).toHaveLength(2);
    for (const species of ['golem', 'steelix', 'tyranitar']) {
      const x = field(duel([species, [NOOP]], ['snorlax', [NOOP]]), 'sand');
      turn(x, mv(0), mv(0));
      expect(A(x).hp, species).toBe(A(x).maxHp);
    }
    for (const ability of ['overcoat', 'sand-veil', 'sand-force', 'sand-rush', 'magic-guard']) {
      const x = field(duel(['alakazam', [NOOP], ability], ['snorlax', [NOOP]]), 'sand');
      turn(x, mv(0), mv(0));
      expect(A(x).hp, ability).toBe(A(x).maxHp);
    }
  });

  it('arena: los de tipo Roca tienen +50 % de Def. Esp.; nieve: los de tipo Hielo, +50 % de Defensa', () => {
    const rock = (w: 'sand' | null) => field(duel(['alakazam', ['psychic']], ['golem', [NOOP]]), w);
    expect(dmg(rock('sand'), 'psychic') / dmg(rock(null), 'psychic')).toBeCloseTo(1 / 1.5, 1);
    const ice = (w: 'snow' | null) => field(duel(['snorlax', ['body-slam']], ['glaceon', [NOOP]]), w);
    expect(dmg(ice('snow'), 'body-slam') / dmg(ice(null), 'body-slam')).toBeCloseTo(1 / 1.5, 1);
  });

  it('Bola Clima cambia de tipo y de potencia con el clima', () => {
    const none = field(duel(['alakazam', ['weather-ball']], ['blissey', [NOOP]]), null);
    const rain = field(duel(['alakazam', ['weather-ball']], ['blissey', [NOOP]]), 'rain');
    // con lluvia: Agua, potencia 100 (el doble) y ×1,5 por la lluvia → ×3
    expect(dmg(rain, 'weather-ball') / dmg(none, 'weather-ball')).toBeCloseTo(3, 0);
    // y lo mismo ejecutando el turno de verdad
    const lost = (b: ReturnType<typeof duel>) => {
      const hp = B(b).hp;
      turn(b, mv(0), mv(0), [0, 0.99, 0.99]);
      return hp - B(b).hp;
    };
    const ev = turn(field(duel(['alakazam', ['weather-ball']], ['blissey', [NOOP]]), 'rain'), mv(0), mv(0), [0, 0.99, 0.99]);
    expect(ev.find((e) => e.type === 'move')).toMatchObject({ moveType: 'water' });
    const ratio = lost(field(duel(['alakazam', ['weather-ball']], ['blissey', [NOOP]]), 'rain')) / lost(field(duel(['alakazam', ['weather-ball']], ['blissey', [NOOP]]), null));
    expect(ratio).toBeGreaterThan(2.8);
    expect(ratio).toBeLessThan(3.2);
  });

  it('Rayo Solar no necesita cargar con sol y pierde la mitad de potencia con lluvia', () => {
    const sun = field(duel(['alakazam', ['solar-beam']], ['blissey', [NOOP]]), 'sun');
    const ev = turn(sun, mv(0), mv(0), [0.99, 0.99]);
    expect(types(ev)).not.toContain('charge');
    expect(B(sun).hp).toBeLessThan(B(sun).maxHp);
    const normal = field(duel(['alakazam', ['solar-beam']], ['blissey', [NOOP]]), null);
    const rain = field(duel(['alakazam', ['solar-beam']], ['blissey', [NOOP]]), 'rain');
    expect(dmg(rain, 'solar-beam') / dmg(normal, 'solar-beam')).toBeLessThan(0.55);
  });

  it('Trueno no falla con lluvia y acierta la mitad con sol', () => {
    // 90 de precisión de tirada: con sol (50 %) falla, con lluvia (100 %) acierta
    const rain = field(duel(['alakazam', ['thunder']], ['blissey', [NOOP]]), 'rain');
    turn(rain, mv(0), mv(0), [0.89, 0.99, 0.99]);
    expect(B(rain).hp).toBeLessThan(B(rain).maxHp);
    const sun = field(duel(['alakazam', ['thunder']], ['blissey', [NOOP]]), 'sun');
    expect(types(turn(sun, mv(0), mv(0), [0.89, 0.99, 0.99]))).toContain('miss');
  });

  it('Síntesis cura 2/3 con sol, 1/4 con otro clima y 1/2 sin clima', () => {
    const heal = (w: 'sun' | 'rain' | null) => {
      const b = field(duel(['venusaur', ['synthesis']], ['blissey', [NOOP]]), w);
      A(b).hp = 1;
      turn(b, mv(0), mv(0));
      return A(b).hp - 1;
    };
    const max = duel(['venusaur', ['synthesis']], ['blissey', [NOOP]]).sides[0].team[0]!.maxHp;
    expect(heal('sun')).toBe(Math.floor((max * 2) / 3));
    expect(heal('rain')).toBe(Math.floor(max / 4));
    expect(heal(null)).toBe(Math.floor(max / 2));
  });

  it('Desarrollo sube el doble con sol', () => {
    const b = field(duel(['venusaur', ['growth']], ['blissey', [NOOP]]), 'sun');
    turn(b, mv(0), mv(0));
    expect([A(b).stages.atk, A(b).stages.spa]).toEqual([2, 2]);
    const c = duel(['venusaur', ['growth']], ['blissey', [NOOP]]);
    turn(c, mv(0), mv(0));
    expect([A(c).stages.atk, A(c).stages.spa]).toEqual([1, 1]);
  });

  it('en sol no se puede congelar', () => {
    const b = field(duel(['alakazam', ['ice-beam']], ['snorlax', [NOOP]]), 'sun');
    turn(b, mv(0), mv(0), [0, 0.99, 0.99, 0.01]);
    expect(B(b).status).toBeNull();
    expect(statusBlock(B(b), 'freeze', b)).toBe('field');
  });

  it('Nubosidad y Aire Cerrado anulan el clima; Vientos Fuertes quita las debilidades de los Voladores', () => {
    const cloud = field(duel(['alakazam', ['flamethrower'], 'cloud-nine'], ['blissey', [NOOP]]), 'rain');
    expect(effectiveWeather(cloud)).toBeNull();
    const plain = field(duel(['alakazam', ['flamethrower']], ['blissey', [NOOP]]), null);
    expect(dmg(cloud, 'flamethrower')).toBe(dmg(plain, 'flamethrower'));
    const winds = field(duel(['alakazam', ['ice-beam']], ['pidgeot', [NOOP]]), 'strong-winds');
    const calm = field(duel(['alakazam', ['ice-beam']], ['pidgeot', [NOOP]]), null);
    expect(dmg(winds, 'ice-beam') / dmg(calm, 'ice-beam')).toBeCloseTo(0.5, 1);
  });
});

describe('clima fuerte', () => {
  it('un clima normal no lo sustituye, uno fuerte sí', () => {
    const b = duel(['alakazam', ['rain-dance']], ['snorlax', [NOOP]]);
    field(b, 'harsh-sun');
    expect(types(turn(b, mv(0), mv(0)))).toContain('failed');
    expect(b.field.weather).toBe('harsh-sun');
    const c = createBattle([makeSet('kyogre', [NOOP], abilityId('primordial-sea'))], [makeSet('snorlax', [NOOP])]);
    field(c, 'sun');
    startBattle(c, scriptedRng([]));
    expect(c.field.weather).toBe('heavy-rain');
    expect(c.field.weatherSource).toBe(0);
  });

  it('dura mientras su Pokémon siga en el campo y se acaba al retirarse', () => {
    const b = createBattle([makeSet('kyogre', [NOOP], abilityId('primordial-sea')), makeSet('blissey', [NOOP])], [makeSet('snorlax', [NOOP])]);
    startBattle(b, scriptedRng([]));
    for (let i = 0; i < 8; i++) turn(b, mv(0), mv(0)); // no caduca por turnos
    expect(b.field.weather).toBe('heavy-rain');
    const ev = turn(b, sw(1), mv(0));
    expect(b.field.weather).toBeNull();
    expect(ev.map((e) => describeEvent(e, 0))).toContain('Ha dejado de caer el diluvio.');
  });

  it('también se acaba si su Pokémon se debilita', () => {
    const b = createBattle([makeSet('kyogre', [NOOP], abilityId('primordial-sea')), makeSet('blissey', [NOOP])], [makeSet('snorlax', ['hyper-beam'])]);
    startBattle(b, scriptedRng([]));
    A(b).hp = 1;
    turn(b, mv(0), mv(0), [0, 0.99, 0.99]);
    expect(b.field.weather).toBeNull();
    void sendOut;
  });
});

describe('terrenos', () => {
  it('los ataques de terreno los provocan', () => {
    for (const [move, terrain] of [['electric-terrain', 'electric'], ['grassy-terrain', 'grassy'], ['misty-terrain', 'misty'], ['psychic-terrain', 'psychic']] as const) {
      const b = duel(['alakazam', [move]], ['snorlax', [NOOP]]);
      turn(b, mv(0), mv(0));
      expect(b.field.terrain, move).toBe(terrain);
    }
  });

  it('dura 5 turnos', () => {
    const b = duel(['alakazam', ['electric-terrain', NOOP]], ['snorlax', [NOOP]]);
    turn(b, mv(0), mv(0));
    for (let i = 0; i < 3; i++) turn(b, mv(1), mv(0));
    expect(b.field.terrain).toBe('electric');
    const ev = turn(b, mv(1), mv(0));
    expect(b.field.terrain).toBeNull();
    expect(ev.map((e) => describeEvent(e, 0))).toContain('La corriente eléctrica se ha disipado.');
  });

  it('potencian ×1,3 el tipo del terreno, solo a quien pisa el suelo', () => {
    const cases: [string, string, string][] = [['electric', 'thunderbolt', 'psychic'], ['grassy', 'razor-leaf', 'psychic'], ['psychic', 'psychic', 'thunderbolt']];
    for (const [terrain, move, other] of cases) {
      const on = field(duel(['alakazam', [move, other]], ['blissey', [NOOP]]), null, terrain as 'electric');
      const off = field(duel(['alakazam', [move, other]], ['blissey', [NOOP]]), null, null);
      expect(dmg(on, move) / dmg(off, move), terrain).toBeCloseTo(1.3, 1);
      expect(dmg(on, other), `${terrain} no potencia ${other}`).toBe(dmg(off, other));
    }
    const flying = field(duel(['pidgeot', ['thunderbolt']], ['blissey', [NOOP]]), null, 'electric');
    const flyingOff = field(duel(['pidgeot', ['thunderbolt']], ['blissey', [NOOP]]), null, null);
    expect(dmg(flying, 'thunderbolt')).toBe(dmg(flyingOff, 'thunderbolt'));
  });

  it('Terreno Eléctrico impide dormir; Neblinoso impide cualquier estado; solo a quien pisa el suelo', () => {
    const e = field(duel(['alakazam', [NOOP]], ['snorlax', [NOOP]]), null, 'electric');
    expect(statusBlock(B(e), 'sleep', e)).toBe('field');
    expect(statusBlock(B(e), 'burn', e)).toBeNull();
    const m = field(duel(['alakazam', [NOOP]], ['snorlax', [NOOP]]), null, 'misty');
    expect(statusBlock(B(m), 'burn', m)).toBe('field');
    const air = field(duel(['alakazam', [NOOP]], ['pidgeot', [NOOP]]), null, 'misty');
    expect(statusBlock(B(air), 'burn', air)).toBeNull();
  });

  it('Terreno Herboso cura 1/16 a quien pisa el suelo al final del turno', () => {
    const b = field(duel(['snorlax', [NOOP]], ['pidgeot', [NOOP]]), null, 'grassy');
    A(b).hp = 1;
    B(b).hp = 1;
    turn(b, mv(0), mv(0));
    expect(A(b).hp).toBe(1 + Math.floor(A(b).maxHp / 16));
    expect(B(b).hp).toBe(1); // Pidgeot vuela
  });

  it('Terreno Neblinoso reduce a la mitad el Dragón; Herboso, el Terremoto', () => {
    const mist = field(duel(['alakazam', ['dragon-claw']], ['blissey', [NOOP]]), null, 'misty');
    const none = field(duel(['alakazam', ['dragon-claw']], ['blissey', [NOOP]]), null, null);
    expect(dmg(mist, 'dragon-claw') / dmg(none, 'dragon-claw')).toBeCloseTo(0.5, 1);
    const grass = field(duel(['snorlax', ['earthquake']], ['blissey', [NOOP]]), null, 'grassy');
    const flat = field(duel(['snorlax', ['earthquake']], ['blissey', [NOOP]]), null, null);
    expect(dmg(grass, 'earthquake') / dmg(flat, 'earthquake')).toBeCloseTo(0.5, 1);
  });

  it('Terreno Psíquico protege del suelo contra ataques con prioridad', () => {
    const b = field(duel(['snorlax', ['quick-attack']], ['blissey', [NOOP]]), null, 'psychic');
    expect(types(turn(b, mv(0), mv(0), [0, 0.99, 0.99]))).toContain('immune');
    expect(B(b).hp).toBe(B(b).maxHp);
    const air = field(duel(['snorlax', ['quick-attack']], ['pidgeot', [NOOP]]), null, 'psychic');
    turn(air, mv(0), mv(0), [0, 0.99, 0.99]);
    expect(B(air).hp).toBeLessThan(B(air).maxHp);
  });

  it('quien pisa el suelo: ni Voladores ni Levitación', () => {
    const b = duel(['pidgeot', [NOOP]], ['gengar', [NOOP], 'levitate']);
    expect(isGrounded(A(b))).toBe(false);
    expect(isGrounded(B(b))).toBe(false);
    expect(isGrounded(duel(['snorlax', [NOOP]], ['blissey', [NOOP]]).sides[0].team[0]!)).toBe(true);
  });
});

void has; void moveId; void executeTurn; void activeOf;
