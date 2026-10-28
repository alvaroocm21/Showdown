import './ui/styles.css';
import { TYPE_NAMES_ES, getAbility, getMove, getSpecies, spriteUrl } from './core/data';
import { rollPokemon, rollTeam } from './core/generator';
import { createRng, randomSeed } from './core/rng';
import { computeStats } from './core/stats';
import { STAT_KEYS, type MoveCategory, type PokemonSet, type PokeType, type StatKey } from './core/types';

const STAT_LABEL: Record<StatKey, string> = { hp: 'PS', atk: 'Ataque', def: 'Defensa', spa: 'At. Esp.', spd: 'Def. Esp.', spe: 'Velocidad' };
const CATEGORY_LABEL: Record<MoveCategory, string> = { physical: 'Físico', special: 'Especial', status: 'Estado' };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const typeVar = (t: PokeType) => `var(--t-${t})`;

function typeChip(t: PokeType): string {
  return `<span class="chip" style="--tc:${typeVar(t)}">${esc(TYPE_NAMES_ES[t])}</span>`;
}

function renderPokemon(set: PokemonSet, index: number): string {
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
    .map((id) => {
      const m = getMove(id);
      const stab = m.category !== 'status' && (m.power ?? 0) > 0 && species.types.includes(m.type);
      const power = m.power ? `Pot. ${m.power}` : 'Pot. —';
      const acc = m.accuracy ? `Prec. ${m.accuracy}` : 'Prec. —';
      return `<div class="move${stab ? ' stab' : ''}" style="--tc:${typeVar(m.type)}">
        <b>${esc(m.name)}</b>
        <small>${esc(TYPE_NAMES_ES[m.type])} · ${CATEGORY_LABEL[m.category]}${stab ? ' · STAB' : ''}</small><br />
        <small>${power} · ${acc} · PP ${m.pp}</small>
      </div>`;
    })
    .join('');

  return `<article class="card">
    <div class="card-head" style="--c1:${typeVar(t1)};--c2:${typeVar(t2)}">
      <img src="${spriteUrl(species.id)}" alt="${esc(species.name)}" loading="lazy" width="96" height="96" />
      <div>
        <div class="dex">#${String(species.id).padStart(3, '0')} · Nv. ${set.build.level}</div>
        <h2>${esc(species.name)}</h2>
        <div class="chips">${species.types.map(typeChip).join('')}</div>
      </div>
    </div>
    <div class="body">
      <div class="ability"><strong>${esc(ability.name)}</strong><p>${esc(ability.description)}</p></div>
      <div class="moves">${moves}</div>
      <div class="stats">${statRows}</div>
    </div>
    <button class="alt" data-reroll="${index}" style="margin:0 12px 12px">🎲 Cambiar este Pokémon</button>
  </article>`;
}

let seed = Number(location.hash.slice(1)) || randomSeed();
let team: PokemonSet[] = [];

function draw(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <h1>Liga Pokémon Aleatoria</h1>
    <p class="sub">Fase 1 · equipo sorteado con ataques y habilidad al azar</p>
    <div class="toolbar"><button class="main" id="roll">🎲 Sortear equipo nuevo</button></div>
    <div class="seed">Semilla ${seed}</div>
    <section class="team">${team.map(renderPokemon).join('')}</section>`;
  document.getElementById('roll')!.addEventListener('click', () => newTeam());
  app.querySelectorAll<HTMLButtonElement>('[data-reroll]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.reroll);
      const others = new Set(team.filter((_, j) => j !== i).map((p) => p.speciesId));
      team[i] = rollPokemon(createRng(randomSeed()), others);
      draw();
    }),
  );
}

function newTeam(): void {
  seed = randomSeed();
  history.replaceState(null, '', `#${seed}`);
  team = rollTeam(createRng(seed));
  draw();
}

team = rollTeam(createRng(seed));
draw();
