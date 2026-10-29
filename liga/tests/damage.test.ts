import { describe, expect, it } from 'vitest';
import { calcDamage, critChance } from '../src/core/battle/damage';
import { accuracyMultiplier, applyStage, stageMultiplier } from '../src/core/battle/stages';
import { effectivenessLabel, typeEffectiveness } from '../src/core/battle/typeEffect';

const base = { level: 50, power: 100, attack: 100, defense: 100, stab: false, effectiveness: 1, crit: false, roll: 100 };

describe('fórmula de daño', () => {
  it('daño base nivel 50, potencia 100, ataque = defensa', () => {
    // floor(floor(22 * 100 * 100 / 100) / 50) + 2 = 46
    expect(calcDamage(base)).toBe(46);
  });

  it('variación aleatoria 85-100 %', () => {
    expect(calcDamage({ ...base, roll: 85 })).toBe(39);
    expect(calcDamage({ ...base, roll: 92 })).toBe(42);
  });

  it('STAB ×1,5, efectividad y crítico ×1,5 (redondeando hacia abajo en cada paso)', () => {
    expect(calcDamage({ ...base, stab: true })).toBe(69);
    expect(calcDamage({ ...base, effectiveness: 2 })).toBe(92);
    expect(calcDamage({ ...base, effectiveness: 4 })).toBe(184);
    expect(calcDamage({ ...base, effectiveness: 0.5 })).toBe(23);
    expect(calcDamage({ ...base, crit: true })).toBe(69);
    expect(calcDamage({ ...base, roll: 85, stab: true })).toBe(58);
  });

  it('la quemadura reduce a la mitad el daño físico, no el especial', () => {
    expect(calcDamage({ ...base, burned: true, physical: true })).toBe(23);
    expect(calcDamage({ ...base, burned: true, physical: false })).toBe(46);
  });

  it('ataque y defensa distintos', () => {
    // floor(22*80*150/80 / 50) + 2 = 68
    expect(calcDamage({ ...base, power: 80, attack: 150, defense: 80 })).toBe(68);
  });

  it('inmunidad = 0 y el daño mínimo es 1', () => {
    expect(calcDamage({ ...base, effectiveness: 0 })).toBe(0);
    expect(calcDamage({ ...base, level: 1, power: 1, attack: 1, defense: 500, effectiveness: 0.25 })).toBe(1);
  });

  it('probabilidad de crítico por nivel', () => {
    expect(critChance(0)).toBeCloseTo(1 / 16);
    expect(critChance(1)).toBeCloseTo(1 / 8);
    expect(critChance(2)).toBe(0.5);
    expect(critChance(9)).toBe(1);
  });
});

describe('tipos', () => {
  it('multiplica los dos tipos del defensor', () => {
    expect(typeEffectiveness('fire', ['grass', 'steel'])).toBe(4);
    expect(typeEffectiveness('water', ['fire', 'ground'])).toBe(4);
    expect(typeEffectiveness('grass', ['fire', 'flying'])).toBe(0.25);
    expect(typeEffectiveness('electric', ['water', 'ground'])).toBe(0);
    expect(typeEffectiveness('ground', ['flying'])).toBe(0);
    expect(typeEffectiveness('normal', ['ghost'])).toBe(0);
    expect(typeEffectiveness('fighting', ['normal', 'rock'])).toBe(4);
    expect(typeEffectiveness('fire', ['water', 'grass'])).toBe(1);
    expect(typeEffectiveness('dragon', ['fairy'])).toBe(0);
    expect(typeEffectiveness('steel', ['fairy'])).toBe(2);
  });
  it('etiquetas', () => {
    expect(effectivenessLabel(0)).toBe('immune');
    expect(effectivenessLabel(0.25)).toBe('resisted');
    expect(effectivenessLabel(1)).toBe('neutral');
    expect(effectivenessLabel(4)).toBe('super');
  });
});

describe('niveles de estadística', () => {
  it('multiplicadores de -6 a +6', () => {
    expect(stageMultiplier(0)).toBe(1);
    expect(stageMultiplier(1)).toBe(1.5);
    expect(stageMultiplier(6)).toBe(4);
    expect(stageMultiplier(-1)).toBeCloseTo(2 / 3);
    expect(stageMultiplier(-6)).toBe(0.25);
    expect(stageMultiplier(9)).toBe(4);
    expect(applyStage(100, 2)).toBe(200);
    expect(accuracyMultiplier(1)).toBeCloseTo(4 / 3);
    expect(accuracyMultiplier(-6)).toBeCloseTo(1 / 3);
  });
});
