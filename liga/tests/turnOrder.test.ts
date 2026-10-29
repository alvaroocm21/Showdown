import { describe, expect, it } from 'vitest';
import { orderActions } from '../src/core/battle/turnOrder';
import { scriptedRng } from './helpers';

describe('orden de turnos', () => {
  it('la prioridad manda sobre la velocidad', () => {
    const order = orderActions([{ side: 0, priority: 1, speed: 10 }, { side: 1, priority: 0, speed: 200 }], scriptedRng([]));
    expect(order).toEqual([0, 1]);
  });
  it('a igual prioridad actúa primero el más rápido', () => {
    expect(orderActions([{ side: 0, priority: 0, speed: 80 }, { side: 1, priority: 0, speed: 120 }], scriptedRng([]))).toEqual([1, 0]);
    expect(orderActions([{ side: 0, priority: 0, speed: 130 }, { side: 1, priority: 0, speed: 120 }], scriptedRng([]))).toEqual([0, 1]);
  });
  it('un empate exacto se decide al azar', () => {
    const tie = [{ side: 0 as const, priority: 0, speed: 100 }, { side: 1 as const, priority: 0, speed: 100 }];
    expect(orderActions(tie, scriptedRng([0.1]))).toEqual([0, 1]);
    expect(orderActions(tie, scriptedRng([0.9]))).toEqual([1, 0]);
  });
  it('prioridad negativa va la última', () => {
    expect(orderActions([{ side: 0, priority: -6, speed: 300 }, { side: 1, priority: 0, speed: 1 }], scriptedRng([]))).toEqual([1, 0]);
  });
});
