import { describe, expect, it } from 'vitest';
import { ABILITIES, MOVES, NATURES, SPECIES, TYPE_CHART, dexNumber, getNature, getSpecies, isMega, megasOf, spriteUrl } from '../src/core/data';
import { computeStats, DEFAULT_BUILD } from '../src/core/stats';
import { TYPE_NAMES } from '../src/core/types';

describe('datos descargados', () => {
  it('contienen todas las generaciones', () => {
    const base = SPECIES.filter((s) => !s.form);
    expect(base).toHaveLength(1025);
    expect(base.every((s, i) => s.id === i + 1)).toBe(true);
    const perGen = new Map<number, number>();
    for (const s of base) perGen.set(s.generation, (perGen.get(s.generation) ?? 0) + 1);
    expect([...perGen.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [1, 151], [2, 100], [3, 135], [4, 107], [5, 156], [6, 72], [7, 88], [8, 96], [9, 120],
    ]);
    expect(ABILITIES.length).toBeGreaterThan(300);
    expect(MOVES.length).toBeGreaterThan(800);
    expect(base.filter((s) => s.legendary).length).toBeGreaterThan(80);
  });

  it('incluyen las formas regionales y las megaevoluciones', () => {
    const forms = SPECIES.filter((s) => s.form);
    const regional = forms.filter((s) => s.form!.kind === 'regional');
    const megas = forms.filter((s) => s.form!.kind === 'mega');
    expect(regional).toHaveLength(57);
    expect(megas).toHaveLength(97);
    const region = (g: number, label: string) => regional.filter((s) => s.generation === g && s.form!.label.startsWith(label)).length;
    expect([region(7, 'Alola'), region(8, 'Galar'), region(8, 'Hisui'), region(9, 'Paldea')]).toEqual([18, 19, 16, 4]);
    expect(new Set(SPECIES.map((s) => s.slug)).size).toBe(SPECIES.length);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    // no se cuelan formas que no son regionales ni mega
    for (const f of forms) expect(f.slug, f.slug).toMatch(/-(alola|galar|hisui|paldea|mega)(-|$)/);
    for (const f of forms) expect(f.slug, f.slug).not.toMatch(/totem|-cap|-zen|gmax|primal/);
  });

  it('cada forma apunta a una especie base real y conserva su etapa y su carácter de legendario', () => {
    for (const f of SPECIES.filter((s) => s.form)) {
      const base = getSpecies(f.form!.baseId);
      expect(base.form, f.slug).toBeUndefined();
      expect(f.finalStage, f.slug).toBe(base.finalStage);
      expect(f.legendary, f.slug).toBe(base.legendary);
      expect(f.id, f.slug).toBeGreaterThan(10000);
      expect(f.name.length, f.slug).toBeGreaterThan(3);
    }
  });

  it('las megaevoluciones suben el total de estadísticas y casi todas conservan los PS', () => {
    const total = (s: { baseStats: Record<string, number> }) => Object.values(s.baseStats).reduce((a, b) => a + b, 0);
    // Las dos megas de Leyendas Z-A que sí cambian los PS base (el motor lo tiene en cuenta al megaevolucionar)
    const changesHp = new Set(['floette-mega', 'zygarde-mega']);
    for (const m of SPECIES.filter((s) => s.form?.kind === 'mega')) {
      const base = getSpecies(m.form!.baseId);
      expect(total(m), m.slug).toBeGreaterThan(total(base));
      if (changesHp.has(m.slug)) expect(m.baseStats.hp, m.slug).toBeGreaterThan(base.baseStats.hp);
      else expect(m.baseStats.hp, m.slug).toBe(base.baseStats.hp);
    }
  });

  it('datos concretos de formas y megas', () => {
    const by = (slug: string) => SPECIES.find((s) => s.slug === slug)!;
    expect(by('raichu-alola')).toMatchObject({ name: 'Raichu de Alola', types: ['electric', 'psychic'] });
    expect(by('ninetales-alola').types).toEqual(['ice', 'fairy']);
    expect(by('tauros-paldea-blaze-breed')).toMatchObject({ name: 'Tauros de Paldea (Ardiente)', types: ['fighting', 'fire'] });
    expect(by('charizard-mega-x')).toMatchObject({ name: 'Mega-Charizard X', types: ['fire', 'dragon'] });
    expect(by('charizard-mega-x').form).toEqual({ kind: 'mega', baseId: 6, label: 'Mega X' });
    expect(megasOf(6).map((m) => m.slug)).toEqual(['charizard-mega-x', 'charizard-mega-y']);
    expect(megasOf(by('charizard-mega-x').id)).toHaveLength(2); // también desde una forma
    expect(megasOf(25)).toHaveLength(0);
    expect(dexNumber(by('raichu-alola'))).toBe(26);
    expect(isMega(by('venusaur-mega'))).toBe(true);
    expect(isMega(by('raichu-alola'))).toBe(false);
  });

  it('no incluyen movimientos Z ni Dinamax (no se pueden usar sueltos)', () => {
    expect(MOVES.filter((m) => m.pp === 1).map((m) => m.slug).sort()).toEqual(['revival-blessing', 'sketch']);
    expect(MOVES.some((m) => m.slug.startsWith('max-') || /--(physical|special)$/.test(m.slug))).toBe(false);
  });

  it('cada Pokémon tiene tipos, estadísticas y un sprite que existe (1-1025)', () => {
    for (const s of SPECIES) {
      expect(s.types.length, s.slug).toBeGreaterThanOrEqual(1);
      expect(s.types.length, s.slug).toBeLessThanOrEqual(2);
      for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) expect(s.baseStats[k], `${s.slug} ${k}`).toBeGreaterThan(0);
    }
    expect(spriteUrl(1025)).toMatch(/home\/1025\.png$/);
  });

  it('todos los ataques y habilidades tienen datos completos', () => {
    for (const m of MOVES) {
      expect(m.name, m.slug).toBeTruthy();
      expect(m.pp, m.slug).toBeGreaterThan(0);
      expect(TYPE_NAMES.includes(m.type), m.slug).toBe(true);
    }
    for (const a of ABILITIES) {
      expect(a.name, a.slug).toBeTruthy();
      expect(a.description, a.slug).toBeTruthy();
    }
  });

  it('tiene nombres en español', () => {
    expect(getSpecies(25).name).toBe('Pikachu');
    expect(getSpecies(1000).slug).toBe('gholdengo');
    expect(getSpecies(1000).generation).toBe(9);
    expect(MOVES.find((m) => m.slug === 'flamethrower')?.name).toBe('Lanzallamas');
    expect(ABILITIES.find((a) => a.slug === 'intimidate')?.name).toBe('Intimidación');
  });

  it('la tabla de tipos cubre los 18 tipos', () => {
    for (const a of TYPE_NAMES) for (const d of TYPE_NAMES) expect(TYPE_CHART[a][d]).toBeTypeOf('number');
    expect(TYPE_CHART.fire.grass).toBe(2);
    expect(TYPE_CHART.water.fire).toBe(2);
    expect(TYPE_CHART.normal.ghost).toBe(0);
    expect(TYPE_CHART.electric.ground).toBe(0);
    expect(TYPE_CHART.dragon.fairy).toBe(0);
    expect(TYPE_CHART.fire.water).toBe(0.5);
  });

  it('la naturaleza por defecto es neutra', () => {
    const n = getNature(DEFAULT_BUILD.natureId);
    expect(n.up).toBeNull();
    expect(n.slug).toBe('serious');
  });
});

describe('estadísticas', () => {
  it('Charizard nivel 50, IV 31, EV 0, naturaleza neutra', () => {
    expect(computeStats(6, DEFAULT_BUILD)).toEqual({ hp: 153, atk: 104, def: 98, spa: 129, spd: 105, spe: 120 });
  });

  it('la naturaleza sube un 10 % y baja otro 10 %', () => {
    const nature = NATURES.find((n) => n.slug === 'adamant')!;
    const adamant = { ...DEFAULT_BUILD, natureId: nature.id };
    expect(nature.up).toBe('atk');
    expect(nature.down).toBe('spa');
    const base = computeStats(6, DEFAULT_BUILD);
    const adj = computeStats(6, adamant);
    expect(adj.atk).toBe(Math.floor(base.atk * 1.1));
    expect(adj.spa).toBe(Math.floor(base.spa * 0.9));
    expect(adj.hp).toBe(base.hp);
  });

  it('los EVs suman 1 punto cada 4', () => {
    const evs = { ...DEFAULT_BUILD, evs: { ...DEFAULT_BUILD.evs, hp: 252 } };
    expect(computeStats(6, evs).hp).toBe(185);
  });
});
