import { getAbility } from '../../../data';
import { TYPE_CHART } from '../../../data';
import { abilityActivates, changeAbility, changeStage, foeOf, transformInto } from '../../ops';
import { moveOf } from '../../state';
import { defOf, abilitySlug } from '../dispatch';
import { UNCHANGEABLE } from './defense';
import type { AbilityDef } from '../types';

/** Efectos al entrar en combate y al retirarse. */

/** Las habilidades de «una vez por combate» solo actúan la primera vez que el Pokémon entra. */
const once = (apply: NonNullable<AbilityDef['onSwitchIn']>): AbilityDef['onSwitchIn'] => (ctx, self, side) => {
  if (self.abilityUsed) return;
  self.abilityUsed = true;
  apply(ctx, self, side);
};

const UNCOPIABLE: ReadonlySet<string> = new Set([...UNCHANGEABLE, 'trace', 'illusion', 'imposter', 'receiver', 'power-of-alchemy', 'flower-gift', 'forecast']);

export const entryDefs: Record<string, AbilityDef> = {
  trace: {
    onSwitchIn: (ctx, self, side) => {
      const foe = foeOf(ctx, self);
      if (foe.hp <= 0 || UNCOPIABLE.has(abilitySlug(foe))) return;
      changeAbility(ctx, self, foe.abilityId);
      abilityActivates(ctx, self, `Copia ${getAbility(foe.abilityId).name}.`);
      defOf(self)?.onSwitchIn?.(ctx, self, side);
    },
  },
  imposter: {
    onSwitchIn: (ctx, self) => {
      const foe = foeOf(ctx, self);
      if (foe.hp > 0) {
        abilityActivates(ctx, self, 'Se transforma.');
        transformInto(ctx, self, foe);
      }
    },
  },
  download: {
    onSwitchIn: (ctx, self) => {
      const foe = foeOf(ctx, self);
      if (foe.hp <= 0) return;
      abilityActivates(ctx, self, 'Analiza al rival.');
      changeStage(ctx, self, foe.stats.def < foe.stats.spd ? 'atk' : 'spa', 1, null);
    },
  },
  'slow-start': {
    onSwitchIn: (ctx, self) => {
      self.slowStart = 5;
      abilityActivates(ctx, self, '¡No se pone en marcha!');
    },
  },
  'supersweet-syrup': {
    onSwitchIn: once((ctx, self) => {
      const foe = foeOf(ctx, self);
      if (foe.hp <= 0) return;
      abilityActivates(ctx, self, 'Esparce un néctar dulce.');
      changeStage(ctx, foe, 'eva', -1, self);
    }),
  },
  'intrepid-sword': { onSwitchIn: once((ctx, self) => { abilityActivates(ctx, self); changeStage(ctx, self, 'atk', 1, null); }) },
  'dauntless-shield': { onSwitchIn: once((ctx, self) => { abilityActivates(ctx, self); changeStage(ctx, self, 'def', 1, null); }) },
  anticipation: {
    onSwitchIn: (ctx, self) => {
      const foe = foeOf(ctx, self);
      const danger = foe.moves.some((bm) => {
        const m = moveOf(bm.moveId);
        if (m.category === 'status') return false;
        const mult = self.types.reduce((acc, t) => acc * TYPE_CHART[m.type][t], 1);
        return mult > 1 || m.effectId === 39;
      });
      if (danger) abilityActivates(ctx, self, '¡Se estremece!');
    },
  },
  forewarn: {
    onSwitchIn: (ctx, self) => {
      const foe = foeOf(ctx, self);
      const strongest = [...foe.moves].map((bm) => moveOf(bm.moveId)).sort((a, b) => (b.power ?? 0) - (a.power ?? 0))[0];
      if (strongest) abilityActivates(ctx, self, `Presiente ${strongest.name}.`);
    },
  },
  // Se cura 1/3 al retirarse (sin aviso: el Pokémon ya no está en el campo)
  regenerator: {
    onSwitchOut: (_ctx, self) => {
      if (self.hp > 0) self.hp = Math.min(self.maxHp, self.hp + Math.floor(self.maxHp / 3));
    },
  },
};
