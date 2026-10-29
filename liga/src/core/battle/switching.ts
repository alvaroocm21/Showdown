import { checkStrongWeather } from './field';
import { refreshSuppression, runSwitchIn, runSwitchOut } from './abilities';
import { emit, type Ctx } from './ops';
import { activeOf, resetVolatile, type Side } from './state';

/** Anuncia la entrada del Pokémon activo de un bando (evento 'switch'). */
export function announceEntry(ctx: Ctx, side: Side): void {
  const b = activeOf(ctx.battle, side);
  b.firstTurn = true;
  emit(ctx, {
    type: 'switch', side, index: ctx.battle.sides[side].active, pokemon: b.name, speciesId: b.speciesId,
    level: b.level, types: [...b.types], hp: b.hp, maxHp: b.maxHp, status: b.status,
  });
}

/** Un Pokémon entra al campo: se anuncia y actúan sus habilidades de entrada. */
export function enter(ctx: Ctx, side: Side): void {
  announceEntry(ctx, side);
  refreshSuppression(ctx.battle);
  runSwitchIn(ctx, side);
}

/** Retira al Pokémon activo (si sigue vivo) y saca al compañero `to`. */
export function doSwitch(ctx: Ctx, side: Side, to: number): void {
  const s = ctx.battle.sides[side];
  const out = s.team[s.active]!;
  if (out.hp > 0) {
    emit(ctx, { type: 'recall', side, pokemon: out.name });
    runSwitchOut(ctx, out);
  }
  resetVolatile(out);
  s.active = to;
  s.enteredTurn = ctx.battle.turn;
  checkStrongWeather(ctx);
  enter(ctx, side);
}
