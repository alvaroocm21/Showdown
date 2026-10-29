import { matchReward, rewardFor } from '../../core/game/economy';
import { resultForMatch, simulateMatch } from '../../core/game/play';
import { archiveSeason, champion, currentRound, findMatch, isSeasonComplete, allMatches } from '../../core/game/season';
import { findProfile, recordMatch, startSeason, updateProfile } from '../../core/game/state';
import { computeStandings } from '../../core/game/standings';
import { MAX_PLAYERS, MIN_PLAYERS, type GameState, type Match, type Profile, type Season } from '../../core/game/types';
import { avatarHtml, confetti, esc } from '../shared';
import type { AppCtx } from '../app';

type Tab = 'round' | 'table' | 'calendar';
let tab: Tab = 'round';
/** Jornada que está mirando el usuario (null = la actual). */
let shown: number | null = null;
/** Participantes marcados al preparar la temporada. Mientras el usuario no los toque, son los primeros perfiles. */
let selected = new Set<string>();
let selectionTouched = false;
let confettiShownFor = 0;

const fmtDate = (t: number) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

export function mountLeague(ctx: AppCtx): void {
  const state = ctx.store.get();
  if (!state.season) return mountSetup(ctx, state);
  mountSeason(ctx, state, state.season);
}

// ---------------------------------------------------------------------------------------------
// Preparación de la temporada
// ---------------------------------------------------------------------------------------------

function mountSetup(ctx: AppCtx, state: GameState): void {
  const profiles = state.profiles;
  if (!selectionTouched) selected = new Set(profiles.slice(0, MAX_PLAYERS).map((p) => p.id));
  for (const id of [...selected]) if (!findProfile(state, id)) selected.delete(id);
  const count = selected.size;
  const ok = count >= MIN_PLAYERS && count <= MAX_PLAYERS;

  const rows = profiles
    .map(
      (p) => `<label class="sel${selected.has(p.id) ? ' on' : ''}">
        <input type="checkbox" data-sel="${esc(p.id)}" ${selected.has(p.id) ? 'checked' : ''} />
        ${avatarHtml(p.avatar, 'sm')}
        <span class="pname"><b>${esc(p.name)}</b></span>
        <button type="button" class="star small${p.main ? ' on' : ''}" data-star="${esc(p.id)}" aria-label="Perfil principal">★</button>
      </label>`,
    )
    .join('');

  const history = [...state.history]
    .reverse()
    .map(
      (r) => `<div class="hrow"><span>Temporada ${r.number}</span><b>🏆 ${esc(r.championName)}</b><small>${fmtDate(r.finishedAt)}</small></div>`,
    )
    .join('');

  ctx.root.innerHTML = `
    <h1>Liga · Temporada ${state.nextSeasonNumber}</h1>
    <p class="sub">Todos contra todos, solo ida · 3 puntos por victoria</p>
    ${
      profiles.length < MIN_PLAYERS
        ? `<div class="card empty">Necesitas al menos ${MIN_PLAYERS} perfiles para jugar una liga (tienes ${profiles.length}).<br /><br /><button class="main" id="toprofiles">＋ Crear perfiles</button></div>`
        : `<section class="card form">
            <h3>¿Quién participa?</h3>
            <p class="muted">Elige entre ${MIN_PLAYERS} y ${MAX_PLAYERS} perfiles. ★ = principal (sus combates los juegas tú).</p>
            <div class="sels">${rows}</div>
            <p class="${ok ? 'okmsg' : 'err'}">${count} seleccionado${count === 1 ? '' : 's'}${ok ? '' : ` · hacen falta entre ${MIN_PLAYERS} y ${MAX_PLAYERS}`}</p>
            <button class="main" id="start" ${ok ? '' : 'disabled'}>🏁 Empezar temporada</button>
          </section>`
    }
    ${state.history.length ? `<section class="card"><h3>Temporadas anteriores</h3>${history}</section>` : ''}`;

  ctx.root.querySelector('#toprofiles')?.addEventListener('click', () => ctx.go({ name: 'profiles' }));
  ctx.root.querySelectorAll<HTMLInputElement>('[data-sel]').forEach((c) =>
    c.addEventListener('change', () => {
      selectionTouched = true;
      if (c.checked) selected.add(c.dataset.sel!);
      else selected.delete(c.dataset.sel!);
      mountSetup(ctx, ctx.store.get());
    }),
  );
  ctx.root.querySelectorAll<HTMLButtonElement>('[data-star]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      ctx.store.commit(updateProfile(ctx.store.get(), b.dataset.star!, (p) => ({ ...p, main: !p.main })));
      mountSetup(ctx, ctx.store.get());
    }),
  );
  ctx.root.querySelector('#start')?.addEventListener('click', () => {
    const current = ctx.store.get();
    const order = current.profiles.filter((p) => selected.has(p.id)).map((p) => p.id);
    try {
      ctx.store.commit(startSeason(current, order, ctx.rng()));
      tab = 'round';
      shown = null;
      ctx.toast(`¡Empieza la temporada ${current.nextSeasonNumber}!`);
      mountLeague(ctx);
    } catch (e) {
      ctx.toast((e as Error).message);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Temporada en curso
// ---------------------------------------------------------------------------------------------

function mountSeason(ctx: AppCtx, state: GameState, season: Season): void {
  const profiles = new Map(state.profiles.map((p) => [p.id, p]));
  const names = new Map(state.profiles.map((p) => [p.id, p.name]));
  const prof = (id: string): Profile => profiles.get(id)!;
  const nameOf = (id: string) => esc(prof(id).name);
  const label = (id: string) => `${avatarHtml(prof(id).avatar, 'sm')}<span>${nameOf(id)}${prof(id).main ? ' <i class="mstar">★</i>' : ''}</span>`;

  const total = allMatches(season).length;
  const played = allMatches(season).filter((m) => m.result).length;
  const complete = isSeasonComplete(season);
  const cur = currentRound(season);
  const round = Math.min(season.rounds.length - 1, Math.max(0, shown ?? cur ?? season.rounds.length - 1));
  const champId = complete ? champion(season, names) : null;

  const matchCard = (m: Match): string => {
    const a = prof(m.a);
    const b = prof(m.b);
    let middle: string;
    let actions = '';
    let caption = '';
    if (m.result) {
      middle = `<div class="mres"><span class="score">${m.result.faintedA} – ${m.result.faintedB}</span></div>`;
      const prize = rewardFor(m, m.result);
      caption = `<div class="mcap">Pokémon debilitados · ${m.result.mode === 'played' ? 'jugado' : 'simulado'} · <b>+${prize.coins} 🪙 ${esc(prof(prize.profileId).name)}</b></div>`;
    } else {
      middle = '<div class="mres"><span class="vs">VS</span></div>';
      const bothNotMain = !a.main && !b.main;
      actions = `<div class="mact">
          <button class="${a.main ? 'main' : 'alt'} small" data-play="${m.id}" data-as="${esc(a.id)}">Jugar con ${esc(a.name)}</button>
          <button class="${b.main ? 'main' : 'alt'} small" data-play="${m.id}" data-as="${esc(b.id)}">Jugar con ${esc(b.name)}</button>
          ${bothNotMain ? `<button class="alt small" data-sim="${m.id}">⚡ Simular</button>` : ''}
        </div>`;
    }
    return `<article class="match${m.result ? ' done' : ''}">
      <div class="mrow">
        <div class="mside${m.result && m.result.winner === m.a ? ' win' : ''}">${label(m.a)}${m.result && m.result.winner === m.a ? ' 🏆' : ''}</div>
        ${middle}
        <div class="mside right${m.result && m.result.winner === m.b ? ' win' : ''}">${label(m.b)}${m.result && m.result.winner === m.b ? ' 🏆' : ''}</div>
      </div>${caption}${actions}</article>`;
  };

  const roundView = (): string => {
    const matches = season.rounds[round]!;
    const bye = season.byes[round];
    const simulable = matches.filter((m) => !m.result && !prof(m.a).main && !prof(m.b).main).length;
    const mustPlay = matches.filter((m) => !m.result && (prof(m.a).main || prof(m.b).main)).length;
    return `
      <div class="rnav">
        <button class="alt small" id="prev" ${round === 0 ? 'disabled' : ''}>◀</button>
        <b>Jornada ${round + 1} de ${season.rounds.length}${cur === round ? ' · actual' : ''}</b>
        <button class="alt small" id="next" ${round === season.rounds.length - 1 ? 'disabled' : ''}>▶</button>
      </div>
      ${bye ? `<p class="bye">😴 Descansa: <b>${nameOf(bye)}</b></p>` : ''}
      <section class="matches">${matches.map(matchCard).join('')}</section>
      ${simulable > 0 ? `<button class="alt wide" id="simround">⚡ Simular los ${simulable} combate${simulable === 1 ? '' : 's'} sin perfiles principales</button>` : ''}
      ${mustPlay > 0 && simulable === 0 ? '<p class="hint center">Los combates con un perfil principal ★ se juegan a mano.</p>' : ''}`;
  };

  const tableView = (): string => {
    const rows = computeStandings(season, names)
      .map(
        (r, i) => `<tr class="${i === 0 && complete ? 'champ' : ''}">
          <td>${i + 1}</td><td class="tname">${label(r.profileId)}</td>
          <td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td><b>${r.points}</b></td></tr>`,
      )
      .join('');
    return `<div class="card tablewrap"><table class="standings">
      <thead><tr><th>#</th><th>Perfil</th><th title="Jugados">PJ</th><th title="Ganados">PG</th><th title="Perdidos">PP</th><th title="Diferencia de Pokémon debilitados">DIF</th><th>Pts</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="hint">DIF = Pokémon rivales debilitados − propios debilitados. Desempata por DIF.</p></div>`;
  };

  const calendarView = (): string =>
    season.rounds
      .map(
        (ms, r) => `<section class="card cal">
          <h4>Jornada ${r + 1}${cur === r ? ' · actual' : ''}${season.byes[r] ? ` <small>· descansa ${nameOf(season.byes[r]!)}</small>` : ''}</h4>
          ${ms
            .map((m) => {
              const res = m.result;
              return `<div class="crow"><span class="${res?.winner === m.a ? 'w' : ''}">${nameOf(m.a)}</span>
                <span class="cscore">${res ? `${res.faintedA} – ${res.faintedB}` : 'vs'}</span>
                <span class="${res?.winner === m.b ? 'w' : ''} r">${nameOf(m.b)}</span></div>`;
            })
            .join('')}
        </section>`,
      )
      .join('');

  const pct = Math.round((played / total) * 100);
  ctx.root.innerHTML = `
    <h1>Liga · Temporada ${season.number}</h1>
    <p class="sub">${complete ? 'Temporada terminada' : `Jornada ${(cur ?? 0) + 1} de ${season.rounds.length}`} · ${played} de ${total} combates</p>
    <div class="progress"><i style="width:${pct}%"></i></div>
    ${
      complete && champId
        ? `<div class="champion"><div class="trophy">🏆</div><h2>¡${nameOf(champId)} es el campeón!</h2>
            <p>${avatarHtml(prof(champId).avatar, 'lg')}</p>
            <button class="main" id="newseason">🏁 Empezar nueva temporada</button></div>`
        : ''
    }
    <div class="seg">
      <button class="${tab === 'round' ? 'on' : ''}" data-tab="round">Jornada</button>
      <button class="${tab === 'table' ? 'on' : ''}" data-tab="table">Clasificación</button>
      <button class="${tab === 'calendar' ? 'on' : ''}" data-tab="calendar">Calendario</button>
    </div>
    ${tab === 'round' ? roundView() : tab === 'table' ? tableView() : calendarView()}`;

  const redraw = () => mountLeague(ctx);
  if (complete && confettiShownFor !== season.number) {
    confettiShownFor = season.number;
    const box = ctx.root.querySelector<HTMLElement>('.champion');
    if (box) confetti(box, 60);
  }
  ctx.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab as Tab;
      redraw();
    }),
  );
  ctx.root.querySelector('#prev')?.addEventListener('click', () => {
    shown = round - 1;
    redraw();
  });
  ctx.root.querySelector('#next')?.addEventListener('click', () => {
    shown = round + 1;
    redraw();
  });

  ctx.root.querySelector('#newseason')?.addEventListener('click', () => {
    ctx.store.commit(archiveSeason(ctx.store.get()));
    selectionTouched = false;
    shown = null;
    tab = 'round';
    ctx.toast('Temporada archivada en el historial');
    redraw();
  });

  // Jugar un combate con el perfil elegido
  ctx.root.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) =>
    b.addEventListener('click', () => playMatch(ctx, b.dataset.play!, b.dataset.as!)),
  );

  // Simular un combate (solo sin perfiles principales)
  const simulate = (matchId: string): void => {
    const s = ctx.store.get();
    const m = findMatch(s.season!, matchId)!;
    const result = simulateMatch(findProfile(s, m.a)!, findProfile(s, m.b)!, ctx.rng());
    ctx.store.commit(recordMatch(s, matchId, result));
  };
  ctx.root.querySelectorAll<HTMLButtonElement>('[data-sim]').forEach((b) =>
    b.addEventListener('click', () => {
      simulate(b.dataset.sim!);
      redraw();
    }),
  );
  ctx.root.querySelector('#simround')?.addEventListener('click', () => {
    const s = ctx.store.get();
    const todo = s.season!.rounds[round]!.filter((m) => {
      const a = findProfile(s, m.a)!;
      const b = findProfile(s, m.b)!;
      return !m.result && !a.main && !b.main;
    });
    for (const m of todo) simulate(m.id);
    ctx.toast(`${todo.length} combate${todo.length === 1 ? '' : 's'} simulado${todo.length === 1 ? '' : 's'}`);
    redraw();
  });

  // Al terminar una jornada, pasar a la siguiente automáticamente
  if (shown !== null && cur !== null && shown < cur) shown = null;
}

function playMatch(ctx: AppCtx, matchId: string, meId: string): void {
  const state = ctx.store.get();
  const match = findMatch(state.season!, matchId);
  if (!match || match.result) return ctx.toast('Ese combate ya está jugado');
  const me = findProfile(state, meId)!;
  const foe = findProfile(state, meId === match.a ? match.b : match.a)!;
  ctx.battle({
    myTeam: me.team,
    foeTeam: foe.team,
    title: `${me.name} vs ${foe.name}`,
    confirmExit: true,
    reward: (outcome) => (outcome.winner === 0 ? `+${matchReward(outcome.fainted[0])} 🪙 para ${me.name}` : null),
    onExit: () => ctx.go({ name: 'league' }),
    onFinish: (outcome) => {
      try {
        const result = resultForMatch(match, me.id, outcome, 'played');
        ctx.store.commit(recordMatch(ctx.store.get(), matchId, result));
        shown = null;
        const prize = rewardFor(match, result);
        ctx.toast(result.winner === me.id ? `¡Victoria de ${me.name}! +${prize.coins} 🪙` : `Derrota de ${me.name}`);
      } catch (e) {
        ctx.toast((e as Error).message);
      }
      ctx.go({ name: 'league' });
    },
  });
}

