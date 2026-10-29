import { chooseAction } from '../../core/ai';
import { computeMoveDamage, isDamagingMove } from '../../core/battle/damage';
import { executeTurn, legalMoveSlots, type BattleEvent } from '../../core/battle/engine';
import { describeEvent } from '../../core/battle/log';
import { activeOf, createBattle, moveOf, type Battler, type Side } from '../../core/battle/state';
import { typeEffectiveness } from '../../core/battle/typeEffect';
import { TYPE_NAMES_ES, getSpecies, spriteUrl } from '../../core/data';
import { createRng, randomSeed } from '../../core/rng';
import type { PokemonSet, PokeType } from '../../core/types';
import { esc, typeChip, typeVar } from '../shared';

export interface BattleScreenOptions {
  mine: PokemonSet;
  foe: PokemonSet;
  onExit(): void;
  onRematch(): void;
}

const EFFECT_BADGE: Record<string, string> = { '4': '×4', '2': '×2', '0.5': '×½', '0.25': '×¼', '0': '×0' };

function panel(side: Side, b: Battler): string {
  return `<div class="bpanel ${side === 0 ? 'me' : 'foe'}">
    <div class="bname"><b>${esc(b.name)}</b><span>Nv. ${b.level}</span></div>
    <div class="chips">${b.types.map(typeChip).join('')}</div>
    <div class="hp"><i data-hpbar="${side}"></i></div>
    <div class="hptext" data-hptext="${side}"></div>
  </div>`;
}

function slot(side: Side, b: Battler): string {
  const s = getSpecies(b.set.speciesId);
  return `<div class="slot ${side === 0 ? 'me' : 'foe'}" data-slot="${side}">
    <div class="shadow"></div><div class="fx" data-fx="${side}"></div>
    <img src="${spriteUrl(s.id)}" alt="${esc(b.name)}" />
  </div>`;
}

export function mountBattle(root: HTMLElement, o: BattleScreenOptions): void {
  const battle = createBattle([o.mine], [o.foe]);
  const rng = createRng(randomSeed());
  const me = activeOf(battle, 0);
  const foe = activeOf(battle, 1);
  let busy = false;
  let fast = false;

  root.innerHTML = `
    <div class="btop"><button class="alt small" id="exit">← Equipo</button><span>Combate 1 contra 1</span></div>
    <div class="arena">
      ${panel(1, foe)}${slot(1, foe)}
      ${slot(0, me)}${panel(0, me)}
    </div>
    <div class="log" id="log"></div>
    <div class="menu" id="menu"></div>
    <div class="overlay" id="end" hidden></div>`;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const log = $('#log');
  const menu = $('#menu');

  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, fast ? ms / 8 : ms));
  const addLog = (text: string) => {
    const p = document.createElement('p');
    p.textContent = text;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  };
  log.addEventListener('click', () => (fast = true));

  function setHp(side: Side, hp: number, maxHp: number): void {
    const pct = Math.max(0, (hp / maxHp) * 100);
    const bar = $<HTMLElement>(`[data-hpbar="${side}"]`);
    bar.style.width = `${pct}%`;
    bar.className = pct > 50 ? 'ok' : pct > 20 ? 'mid' : 'low';
    $(`[data-hptext="${side}"]`).textContent = side === 0 ? `${hp} / ${maxHp} PS` : `${Math.ceil(pct)} %`;
  }
  setHp(0, me.hp, me.maxHp);
  setHp(1, foe.hp, foe.maxHp);

  const slotEl = (side: Side) => $<HTMLElement>(`[data-slot="${side}"]`);
  const anim = (el: HTMLElement, frames: Keyframe[], ms: number, fill: FillMode = 'none') =>
    el.animate(frames, { duration: fast ? ms / 4 : ms, easing: 'ease-out', fill }).finished.catch(() => undefined);

  async function attackAnim(side: Side, type: PokeType): Promise<void> {
    const dx = side === 0 ? 46 : -46;
    const dy = side === 0 ? -26 : 26;
    await anim(slotEl(side), [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(1.06)` }, { transform: 'none' }], 380);
    const fx = $<HTMLElement>(`[data-fx="${1 - side}"]`);
    fx.style.background = `radial-gradient(circle, #fff 0%, ${typeVar(type)} 35%, transparent 70%)`;
    await anim(fx, [{ opacity: 0.95, transform: 'scale(0.2)' }, { opacity: 0.85, transform: 'scale(1.1)' }, { opacity: 0, transform: 'scale(1.5)' }], 420);
  }

  async function hitAnim(side: Side): Promise<void> {
    const img = slotEl(side).querySelector('img')!;
    void anim(img, [{ filter: 'brightness(1)' }, { filter: 'brightness(3.2) saturate(0.2)' }, { filter: 'brightness(1)' }], 380);
    await anim(slotEl(side), [
      { transform: 'translateX(0)' }, { transform: 'translateX(-9px)' }, { transform: 'translateX(9px)' },
      { transform: 'translateX(-6px)' }, { transform: 'translateX(0)' },
    ], 380);
  }

  async function faintAnim(side: Side): Promise<void> {
    await anim(slotEl(side), [{ transform: 'none', opacity: 1 }, { transform: 'translateY(70px)', opacity: 0 }], 700, 'forwards');
  }

  async function play(events: BattleEvent[]): Promise<void> {
    for (const [i, e] of events.entries()) {
      const text = describeEvent(e, 0);
      switch (e.type) {
        case 'move':
          addLog(text!);
          await wait(250);
          // Los ataques sin efecto implementado (estado) no llevan animación de impacto.
          if (events[i + 1]?.type !== 'noEffect') await attackAnim(e.side, e.moveType);
          break;
        case 'damage':
          await hitAnim(e.side);
          setHp(e.side, e.hp, e.maxHp);
          await wait(550);
          if (text) addLog(text);
          break;
        case 'faint':
          addLog(text!);
          await faintAnim(e.side);
          await wait(300);
          break;
        default:
          if (text) {
            addLog(text);
            await wait(e.type === 'win' ? 300 : 650);
          }
      }
    }
  }

  function renderMenu(): void {
    const slots = legalMoveSlots(me);
    if (slots[0] === -1) {
      menu.innerHTML = `<button class="mv" data-s="-1" style="--tc:${typeVar('normal')}"><b>Forcejeo</b><small>Sin PP · retroceso 1/4</small></button>`;
    } else {
      menu.innerHTML = me.moves
        .map((bm, i) => {
          const m = moveOf(bm.moveId);
          const damaging = isDamagingMove(m);
          const mult = damaging ? typeEffectiveness(m.type, foe.types) : 1;
          const badge = mult !== 1 ? `<em class="eff e${mult === 0 ? '0' : mult > 1 ? 'up' : 'down'}">${EFFECT_BADGE[String(mult)] ?? ''}</em>` : '';
          const est = damaging ? ` · ~${computeMoveDamage(me, foe, m, { crit: false, roll: 92 })} PS` : '';
          return `<button class="mv" data-s="${i}" style="--tc:${typeVar(m.type)}" ${bm.pp <= 0 ? 'disabled' : ''}>
            <b>${esc(m.name)}</b>${badge}
            <small>${esc(TYPE_NAMES_ES[m.type])} · Pot. ${m.power ?? '—'}${est}</small>
            <small>PP ${bm.pp}/${bm.maxPp}${damaging ? '' : ' · sin efecto aún'}</small>
          </button>`;
        })
        .join('');
    }
    menu.querySelectorAll<HTMLButtonElement>('[data-s]').forEach((b) => b.addEventListener('click', () => turn(Number(b.dataset.s))));
  }

  function showEnd(): void {
    const won = battle.winner === 0;
    const end = $('#end');
    end.hidden = false;
    end.innerHTML = `<div class="endcard ${won ? 'won' : 'lost'}">
      <h2>${won ? '🏆 ¡Victoria!' : '💔 Derrota'}</h2>
      <p>${won ? `${esc(me.name)} ha derrotado a ${esc(foe.name)} rival.` : `${esc(foe.name)} rival ha derrotado a ${esc(me.name)}.`}</p>
      <button class="main" id="again">⚔️ Otro combate</button>
      <button class="alt" id="back">← Volver al equipo</button>
    </div>`;
    $('#again').addEventListener('click', o.onRematch);
    $('#back').addEventListener('click', o.onExit);
  }

  async function turn(slotIndex: number): Promise<void> {
    if (busy || battle.winner !== null) return;
    busy = true;
    fast = false;
    menu.querySelectorAll('button').forEach((b) => (b.disabled = true));
    const events = executeTurn(battle, [{ type: 'move', slot: slotIndex }, chooseAction(battle, 1, rng)], rng);
    await play(events);
    busy = false;
    if (battle.winner !== null) showEnd();
    else renderMenu();
  }

  $('#exit').addEventListener('click', o.onExit);
  addLog(`¡Un ${foe.name} rival quiere combatir!`);
  renderMenu();
}
