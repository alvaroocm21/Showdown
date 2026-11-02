import { headToHead } from '../../core/game/history';
import type { AppCtx } from '../app';
import { esc } from '../shared';

let idA: string | null = null;
let idB: string | null = null;

/** Historial de combates de liga entre dos cuentas (todas las temporadas). `seg` es la barra Jornadas/Historial de la pantalla. */
export function mountHistory(ctx: AppCtx, seg: string, bindSeg: () => void): void {
  const state = ctx.store.get();
  const profiles = state.profiles;
  if (!profiles.some((p) => p.id === idA)) idA = ctx.activeId && profiles.some((p) => p.id === ctx.activeId) ? ctx.activeId : profiles[0]?.id ?? null;
  if (!profiles.some((p) => p.id === idB) || idB === idA) idB = profiles.find((p) => p.id !== idA)?.id ?? null;

  const options = (sel: string | null) => profiles.map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  let body: string;
  if (!idA || !idB) {
    body = '<div class="card empty">Hacen falta al menos dos cuentas para ver su historial.</div>';
  } else {
    const h = headToHead(state, idA, idB);
    const nameOf = (id: string, fallback: string) => esc(profiles.find((p) => p.id === id)?.name ?? fallback);
    const a = nameOf(idA, 'A');
    const b = nameOf(idB, 'B');
    const rows = h.matches
      .map((m) => {
        // Se muestra con la cuenta A a la izquierda, sea cual fuera el local
        const aIsHome = m.aId === idA;
        const fa = aIsHome ? m.faintedA : m.faintedB;   // Pokémon de A debilitados
        const fb = aIsHome ? m.faintedB : m.faintedA;
        const won = m.winnerId === idA;
        return `<div class="hrow ${won ? 'won' : 'lost'}">
          <span class="hwhen">T${m.season} · J${m.round + 1}</span>
          <span class="hres">${won ? '🏆' : ''} ${a} <b>${fb} – ${fa}</b> ${b} ${won ? '' : '🏆'}</span>
          <small>${aIsHome ? 'local' : 'visitante'} ${a} · ${m.mode === 'played' ? 'jugado' : 'simulado'} · ${new Date(m.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</small>
        </div>`;
      })
      .join('');
    body = `<div class="card h2h">
        <div class="h2score"><span>${a}</span><b>${h.winsA} – ${h.winsB}</b><span>${b}</span></div>
        <p class="muted center">${h.matches.length} combate${h.matches.length === 1 ? '' : 's'} · Pokémon derribados: ${a} ${h.faintedCausedByA}, ${b} ${h.faintedCausedByB}</p>
      </div>
      ${rows ? `<section class="hlist">${rows}</section>` : '<div class="card empty">Todavía no se han enfrentado en la liga.</div>'}
      <p class="hint center">El número de la izquierda son los Pokémon de ${a} que se debilitaron y el de la derecha los de ${b}.</p>`;
  }
  ctx.root.innerHTML = `<h1>Historial</h1>
    <p class="sub">Combates de liga entre dos cuentas</p>
    ${seg}
    <div class="hpick"><select id="ha" aria-label="Cuenta A">${options(idA)}</select><span>vs</span><select id="hb" aria-label="Cuenta B">${options(idB)}</select></div>
    ${body}`;
  bindSeg();
  ctx.root.querySelector<HTMLSelectElement>('#ha')?.addEventListener('change', (e) => {
    idA = (e.target as HTMLSelectElement).value;
    mountHistory(ctx, seg, bindSeg);
  });
  ctx.root.querySelector<HTMLSelectElement>('#hb')?.addEventListener('change', (e) => {
    idB = (e.target as HTMLSelectElement).value;
    mountHistory(ctx, seg, bindSeg);
  });
}
