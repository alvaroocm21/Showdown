import { isAbilityImplemented } from '../core/battle/abilities';
import { TYPE_NAMES_ES, getAbility, getMove, getSpecies, spriteUrl } from '../core/data';
import { computeStats } from '../core/stats';
import { STAT_KEYS, type MoveCategory, type PokemonSet, type StatKey } from '../core/types';
import { esc, moveEffectText, moveNeedsWarning, typeChip, typeVar } from './shared';

const STAT_LABEL: Record<StatKey, string> = { hp: 'PS', atk: 'Ataque', def: 'Defensa', spa: 'At. Esp.', spd: 'Def. Esp.', spe: 'Velocidad' };
const CATEGORY_LABEL: Record<MoveCategory, string> = { physical: 'Físico', special: 'Especial', status: 'Estado' };


/** `flash` resalta lo que acaba de cambiar tras una mejora. */
export interface CardFlash {
  slot?: number;
  ability?: boolean;
  pokemon?: boolean;
}

export function renderPokemonCard(set: PokemonSet, actions = '', badge = '', flash: CardFlash = {}): string {
  const species = getSpecies(set.speciesId);
  const ability = getAbility(set.abilityId);
  const stats = computeStats(set.speciesId, set.build);
  const t1 = species.types[0]!;
  const t2 = species.types[1] ?? t1;

  const statRows = STAT_KEYS.map((k) => {
    const pct = Math.min(100, Math.round((species.baseStats[k] / 160) * 100));
    return `<span>${STAT_LABEL[k]}</span><div class="bar"><i style="width:${pct}%"></i></div><b>${stats[k]}</b>`;
  }).join('');

  const moves = set.moveIds
    .map((id, index) => {
      const m = getMove(id);
      const stab = m.category !== 'status' && (m.power ?? 0) > 0 && species.types.includes(m.type);
      const effect = moveEffectText(m);
      return `<div class="move${stab ? ' stab' : ''}${moveNeedsWarning(id) ? ' inert' : ''}${flash.slot === index || flash.pokemon ? ' flash' : ''}" style="--tc:${typeVar(m.type)}">
        <b>${esc(m.name)}</b>
        <small>${esc(TYPE_NAMES_ES[m.type])} · ${CATEGORY_LABEL[m.category]}${stab ? ' · STAB' : ''}</small><br />
        <small>Pot. ${m.power ?? '—'} · Prec. ${m.accuracy ?? '—'} · PP ${m.pp}</small>
        ${effect ? `<br /><small class="fx-text">${esc(effect)}</small>` : ''}
      </div>`;
    })
    .join('');

  return `<article class="card">
    <div class="card-head" style="--c1:${typeVar(t1)};--c2:${typeVar(t2)}">
      <img src="${spriteUrl(species.id)}" alt="${esc(species.name)}" loading="lazy" width="96" height="96" />
      <div>
        <div class="dex">#${String(species.id).padStart(3, '0')} · Nv. ${set.build.level}${badge}</div>
        <h2>${esc(species.name)}</h2>
        <div class="chips">${species.types.map(typeChip).join('')}</div>
      </div>
    </div>
    <div class="body">
      <div class="ability${flash.ability || flash.pokemon ? ' flash' : ''}"><strong>${esc(ability.name)}</strong>${isAbilityImplemented(ability.slug) ? '' : ' <em class="inert-tag">sin efecto aún</em>'}<p>${esc(ability.description)}</p></div>
      <div class="moves">${moves}</div>
      <div class="stats">${statRows}</div>
    </div>
    ${actions}
  </article>`;
}

