import { chooseAction, chooseReplacement } from '../../core/ai';
import { computeMoveDamage } from '../../core/battle/damage';
import {
  executeTurn, isTrapped, legalMoveSlots, legalSwitchTargets, sendOut, startBattle,
  type Action, type BattleEvent,
} from '../../core/battle/engine';
import { STATUS_LABEL, describeEvent } from '../../core/battle/log';
import { expectedPower, isDamagingMove } from '../../core/battle/moves';
import { activeOf, createBattle, moveOf, type Battle, type Battler, type Side, type StatusName } from '../../core/battle/state';
import { typeEffectiveness } from '../../core/battle/typeEffect';
import { TYPE_NAMES_ES, spriteUrl } from '../../core/data';
import type { BattleOutcome } from '../../core/game/play';
import { outcomeOf } from '../../core/game/play';
import { createRng, randomSeed } from '../../core/rng';
import type { PokemonSet, PokeType, StageKey } from '../../core/types';
import { STAGE_SHORT, confetti, esc, moveEffectText, typeChip, typeVar } from '../shared';

export interface BattleScreenOptions {
  myTeam: PokemonSet[];
  foeTeam: PokemonSet[];
  /** Título de la barra superior (p. ej. «Ana vs Beto»). */
  title: string;
  onExit(): void;
  /** Combate de liga: al terminar solo se ofrece «Continuar», que entrega el resultado. */
  onFinish?(outcome: BattleOutcome): void;
  /** Combate amistoso: al terminar se ofrece repetir. */
  onRematch?(): void;
  /** Pide confirmación al salir antes de que acabe el combate. */
  confirmExit?: boolean;
  /** Texto del premio (monedas) que se muestra al terminar, si lo hay. */
  reward?(outcome: BattleOutcome): string | null;
}

/** Ambientes de la arena (se elige uno al azar en cada combate). */
const THEMES = ['day', 'sunset', 'night', 'cave', 'beach'] as const;

const EFFECT_BADGE: Record<string, string> = { '4': '×4', '2': '×2', '0.5': '×½', '0.25': '×¼', '0': '×0' };

interface SideView {
  index: number;
  name: string;
  level: number;
  types: PokeType[];
  speciesId: number;
  hp: number;
  maxHp: number;
  status: StatusName | null;
  stages: Partial<Record<StageKey, number>>;
}

export function mountBattle(root: HTMLElement, o: BattleScreenOptions): void {
  const rng = createRng(randomSeed());
  const battle: Battle = createBattle(o.myTeam, o.foeTeam);
  const size = [o.myTeam.length, o.foeTeam.length];
  // Estado visible de cada bando: se actualiza con los eventos para animar paso a paso
  const view: SideView[] = [0, 1].map((s) => {
    const b = battle.sides[s as Side].team[0]!;
    return { index: 0, name: b.name, level: b.level, types: b.types, speciesId: b.set.speciesId, hp: b.hp, maxHp: b.maxHp, status: null, stages: {} };
  });
  const fainted: boolean[][] = [o.myTeam.map(() => false), o.foeTeam.map(() => false)];
  let busy = true;
  let fast = false;

  root.innerHTML = `
    <div class="btop"><button class="alt small" id="exit">← Salir</button><span id="turnno">${esc(o.title)}</span></div>
    <div class="arena theme-${THEMES[rng.int(0, THEMES.length - 1)]}">
      ${panel(1)}${slot(1)}${slot(0)}${panel(0)}
    </div>
    <div class="log" id="log"></div>
    <div class="menu" id="menu"></div>
    <div class="overlay" id="picker" hidden></div>
    <div class="overlay" id="end" hidden></div>`;

  function panel(side: Side): string {
    return `<div class="bpanel ${side === 0 ? 'me' : 'foe'}" data-panel="${side}">
      <div class="bname"><b data-f="name"></b><span data-f="level"></span></div>
      <div class="chips" data-f="types"></div>
      <div class="hp"><i data-f="bar"></i></div>
      <div class="hprow"><span class="pips" data-f="pips"></span><span class="hptext" data-f="hp"></span></div>
      <div class="stages" data-f="stages"></div>
    </div>`;
  }
  function slot(side: Side): string {
    return `<div class="slot ${side === 0 ? 'me' : 'foe'}" data-slot="${side}"><div class="shadow"></div><div class="fx" data-fx="${side}"></div><img alt="" /></div>`;
  }

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const log = $('#log');
  const menu = $('#menu');
  const slotEl = (s: Side) => $<HTMLElement>(`[data-slot="${s}"]`);
  const imgEl = (s: Side) => slotEl(s).querySelector('img')!;
  const field = (s: Side, f: string) => $<HTMLElement>(`[data-panel="${s}"] [data-f="${f}"]`);

  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, fast ? ms / 8 : ms));
  const addLog = (text: string) => {
    const p = document.createElement('p');
    p.textContent = text;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  };
  log.addEventListener('click', () => (fast = true));

  // ---------- Paneles ----------
  function renderHp(s: Side): void {
    const v = view[s]!;
    const pct = Math.max(0, (v.hp / v.maxHp) * 100);
    const bar = field(s, 'bar');
    bar.style.width = `${pct}%`;
    bar.className = pct > 50 ? 'ok' : pct > 20 ? 'mid' : 'low';
    field(s, 'hp').textContent = s === 0 ? `${v.hp}/${v.maxHp}` : `${Math.ceil(pct)} %`;
  }
  function renderPips(s: Side): void {
    field(s, 'pips').innerHTML = fainted[s]!
      .map((f, i) => `<i class="pip${f ? ' out' : ''}${i === view[s]!.index ? ' on' : ''}"></i>`)
      .join('');
  }
  function renderPanel(s: Side): void {
    const v = view[s]!;
    field(s, 'name').innerHTML = `${esc(v.name)}${v.status ? ` <em class="st st-${v.status}">${STATUS_LABEL[v.status]}</em>` : ''}`;
    field(s, 'level').textContent = `Nv. ${v.level}`;
    field(s, 'types').innerHTML = v.types.map(typeChip).join('');
    field(s, 'stages').innerHTML = (Object.entries(v.stages) as [StageKey, number][])
      .filter(([, n]) => n !== 0)
      .map(([k, n]) => `<span class="stg ${n > 0 ? 'up' : 'down'}">${STAGE_SHORT[k]} ${n > 0 ? '+' : ''}${n}</span>`)
      .join('');
    renderHp(s);
    renderPips(s);
  }
  function setSprite(s: Side): void {
    slotEl(s).getAnimations().forEach((a) => a.cancel());
    imgEl(s).getAnimations().forEach((a) => a.cancel());
    imgEl(s).src = spriteUrl(view[s]!.speciesId);
    imgEl(s).alt = view[s]!.name;
    imgEl(s).style.opacity = '1';
  }
  setSprite(0);
  setSprite(1);
  imgEl(0).style.opacity = '0';
  imgEl(1).style.opacity = '0';
  renderPanel(0);
  renderPanel(1);

  // ---------- Animaciones ----------
  const anim = (el: HTMLElement | SVGElement, frames: Keyframe[], ms: number, fill: FillMode = 'none') =>
    el.animate(frames, { duration: fast ? ms / 4 : ms, easing: 'ease-out', fill }).finished.catch(() => undefined);

  async function floatText(s: Side, text: string, cls: string): Promise<void> {
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    slotEl(s).appendChild(el);
    await anim(el, [{ opacity: 0, transform: 'translate(-50%, 10px)' }, { opacity: 1, transform: 'translate(-50%, -16px)', offset: 0.25 }, { opacity: 0, transform: 'translate(-50%, -46px)' }], 900);
    el.remove();
  }

  async function attackAnim(s: Side, type: PokeType): Promise<void> {
    const dx = s === 0 ? 46 : -46;
    const dy = s === 0 ? -26 : 26;
    await anim(slotEl(s), [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(1.06)` }, { transform: 'none' }], 380);
    const fx = $<HTMLElement>(`[data-fx="${1 - s}"]`);
    fx.style.background = `radial-gradient(circle, #fff 0%, ${typeVar(type)} 35%, transparent 70%)`;
    await anim(fx, [{ opacity: 0.95, transform: 'scale(0.2)' }, { opacity: 0.85, transform: 'scale(1.1)' }, { opacity: 0, transform: 'scale(1.5)' }], 420);
  }

  async function hitAnim(s: Side, shake: boolean): Promise<void> {
    void anim(imgEl(s), [{ filter: 'brightness(1)' }, { filter: 'brightness(3.2) saturate(0.2)' }, { filter: 'brightness(1)' }], 380);
    if (shake) {
      await anim(slotEl(s), [
        { transform: 'translateX(0)' }, { transform: 'translateX(-9px)' }, { transform: 'translateX(9px)' },
        { transform: 'translateX(-6px)' }, { transform: 'translateX(0)' },
      ], 380);
    } else await wait(300);
  }

  // ---------- Reproducción de eventos ----------
  async function play(events: BattleEvent[]): Promise<void> {
    for (const e of events) {
      const text = describeEvent(e, 0);
      switch (e.type) {
        case 'turn':
          $('#turnno').textContent = `Turno ${e.turn}`;
          break;
        case 'move':
          addLog(text!);
          await wait(250);
          await attackAnim(e.side, e.moveType);
          break;
        case 'damage':
          await hitAnim(e.side, e.cause === 'move');
          view[e.side]!.hp = e.hp;
          renderHp(e.side);
          await wait(e.cause === 'move' ? 550 : 400);
          if (text) addLog(text);
          break;
        case 'heal':
          view[e.side]!.hp = e.hp;
          renderHp(e.side);
          void floatText(e.side, '+PS', 'good');
          addLog(text!);
          await wait(600);
          break;
        case 'status':
          view[e.side]!.status = e.status;
          renderPanel(e.side);
          if (e.status) void floatText(e.side, STATUS_LABEL[e.status], `st-${e.status}`);
          addLog(text!);
          await wait(650);
          break;
        case 'stage':
          if (e.change !== 0) {
            view[e.side]!.stages[e.stat] = e.stage;
            renderPanel(e.side);
            void floatText(e.side, `${e.change > 0 ? '▲' : '▼'} ${STAGE_SHORT[e.stat]}`, e.change > 0 ? 'good' : 'bad');
          }
          addLog(text!);
          await wait(650);
          break;
        case 'ability':
          void floatText(e.side, e.ability, 'abil');
          addLog(text!);
          await wait(750);
          break;
        case 'recall':
          addLog(text!);
          await anim(imgEl(e.side), [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.2)' }], 350, 'forwards');
          break;
        case 'switch': {
          const s = e.side;
          const v = view[s]!;
          Object.assign(v, { index: e.index, name: e.pokemon, level: e.level, types: e.types, speciesId: e.speciesId, hp: e.hp, maxHp: e.maxHp, status: e.status, stages: {} });
          setSprite(s);
          renderPanel(s);
          addLog(text!);
          await anim(imgEl(s), [{ opacity: 0, transform: 'scale(0.2)' }, { opacity: 1, transform: 'scale(1.1)' }, { opacity: 1, transform: 'scale(1)' }], 450);
          await wait(250);
          break;
        }
        case 'faint': {
          addLog(text!);
          fainted[e.side]![view[e.side]!.index] = true;
          await anim(slotEl(e.side), [{ transform: 'none', opacity: 1 }, { transform: 'translateY(70px)', opacity: 0 }], 700, 'forwards');
          renderPips(e.side);
          await wait(300);
          break;
        }
        case 'crit':
          addLog(text!);
          await anim($<HTMLElement>('.arena'), [
            { transform: 'translate(0,0)' }, { transform: 'translate(-7px,3px)' }, { transform: 'translate(6px,-4px)' },
            { transform: 'translate(-4px,-2px)' }, { transform: 'translate(0,0)' },
          ], 320);
          await wait(450);
          break;
        default:
          if (text) {
            addLog(text);
            await wait(e.type === 'win' ? 300 : 650);
          }
      }
    }
  }

  // ---------- Menús ----------
  const me = (): Battler => activeOf(battle, 0);
  const foe = (): Battler => activeOf(battle, 1);

  function renderMenu(): void {
    const user = me();
    const target = foe();
    const canSwitch = legalSwitchTargets(battle, 0).length > 0;
    let html: string;
    if (user.recharging) {
      html = `<button class="mv wide" data-a="rest" style="--tc:${typeVar('normal')}"><b>💤 Recuperarse</b><small>Debe descansar este turno</small></button>`;
    } else if (legalMoveSlots(user)[0] === -1) {
      html = `<button class="mv wide" data-s="-1" style="--tc:${typeVar('normal')}"><b>Forcejeo</b><small>Sin PP · retroceso 1/4</small></button>`;
    } else {
      const legal = legalMoveSlots(user);
      html = user.moves
        .map((bm, i) => {
          const m = moveOf(bm.moveId);
          const damaging = isDamagingMove(m);
          const mult = m.category !== 'status' ? typeEffectiveness(m.type, target.types) : 1;
          const badge = mult !== 1 && m.category !== 'status' ? `<em class="eff e${mult === 0 ? '0' : mult > 1 ? 'up' : 'down'}">${EFFECT_BADGE[String(mult)] ?? ''}</em>` : '';
          const est = damaging ? ` · ~${computeMoveDamage(user, target, m, { battle, crit: false, roll: 92, power: expectedPower(m, user) })} PS` : '';
          const info = moveEffectText(m);
          return `<button class="mv${info === 'sin efecto aún' ? ' inert' : ''}" data-s="${i}" style="--tc:${typeVar(m.type)}" ${legal.includes(i) ? '' : 'disabled'}>
            <b>${esc(m.name)}</b>${badge}
            <small>${esc(TYPE_NAMES_ES[m.type])} · ${m.power ? `Pot. ${m.power}` : 'Estado'}${est}</small>
            <small>PP ${bm.pp}/${bm.maxPp}${info ? ` · ${esc(info)}` : ''}</small>
          </button>`;
        })
        .join('');
    }
    const switchBtn = `<button class="alt switchbtn" data-a="switch" ${canSwitch ? '' : 'disabled'}>🔄 ${isTrapped(battle, 0) ? 'Atrapado' : 'Cambiar Pokémon'}</button>`;
    menu.innerHTML = html + switchBtn;
    menu.querySelectorAll<HTMLButtonElement>('[data-s]').forEach((b) => b.addEventListener('click', () => turn({ type: 'move', slot: Number(b.dataset.s) })));
    menu.querySelector('[data-a="rest"]')?.addEventListener('click', () => turn({ type: 'move', slot: 0 }));
    menu.querySelector('[data-a="switch"]')?.addEventListener('click', async () => {
      const to = await pickPokemon(false);
      if (to !== null) void turn({ type: 'switch', to });
    });
  }

  /** Lista de Pokémon del equipo para cambiar. Devuelve el elegido (o null si se cancela). */
  function pickPokemon(forced: boolean): Promise<number | null> {
    return new Promise((resolve) => {
      const picker = $('#picker');
      const options = forced ? battle.sides[0].team.flatMap((b, i) => (b.hp > 0 ? [i] : [])) : legalSwitchTargets(battle, 0);
      const rows = battle.sides[0].team
        .map((b, i) => {
          const active = i === battle.sides[0].active && !forced;
          const ok = options.includes(i);
          const pct = Math.round((b.hp / b.maxHp) * 100);
          return `<button class="prow${ok ? '' : ' off'}" data-i="${i}" ${ok ? '' : 'disabled'}>
            <img src="${spriteUrl(b.set.speciesId)}" alt="" />
            <span class="pinfo"><b>${esc(b.name)}${b.status ? ` <em class="st st-${b.status}">${STATUS_LABEL[b.status]}</em>` : ''}</b>
              <span class="chips">${b.types.map(typeChip).join('')}</span>
              <span class="hp small"><i class="${pct > 50 ? 'ok' : pct > 20 ? 'mid' : 'low'}" style="width:${pct}%"></i></span>
              <small>${b.hp > 0 ? `${b.hp}/${b.maxHp} PS${active ? ' · en combate' : ''}` : 'Debilitado'}</small></span>
          </button>`;
        })
        .join('');
      picker.hidden = false;
      picker.innerHTML = `<div class="endcard pick"><h2>${forced ? 'Elige tu siguiente Pokémon' : 'Cambiar Pokémon'}</h2><div class="plist">${rows}</div>${forced ? '' : '<button class="alt" id="cancel">Cancelar</button>'}</div>`;
      const close = (v: number | null) => {
        picker.hidden = true;
        picker.innerHTML = '';
        resolve(v);
      };
      picker.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) => b.addEventListener('click', () => close(Number(b.dataset.i))));
      picker.querySelector('#cancel')?.addEventListener('click', () => close(null));
    });
  }

  function showEnd(): void {
    const won = battle.winner === 0;
    const left = battle.sides[0].team.filter((b) => b.hp > 0).length;
    const foeLeft = battle.sides[1].team.filter((b) => b.hp > 0).length;
    const reward = o.reward?.(outcomeOf(battle)) ?? null;
    const end = $('#end');
    end.hidden = false;
    end.innerHTML = `<div class="endcard ${won ? 'won' : 'lost'}">
      <h2>${won ? '🏆 ¡Victoria!' : '💔 Derrota'}</h2>
      <p>Te quedan ${left} de ${size[0]} Pokémon · al rival ${foeLeft} de ${size[1]}.</p>
      ${reward ? `<p class="reward">${esc(reward)}</p>` : ''}
      ${o.onFinish ? '<button class="main" id="next">Continuar ▶</button>' : '<button class="main" id="again">⚔️ Otro combate</button><button class="alt" id="back">← Volver</button>'}
    </div>`;
    if (won) confetti(end);
    if (o.onFinish) $('#next').addEventListener('click', () => o.onFinish!(outcomeOf(battle)));
    else {
      $('#again').addEventListener('click', () => o.onRematch?.());
      $('#back').addEventListener('click', o.onExit);
    }
  }

  async function afterTurn(): Promise<void> {
    if (battle.winner !== null) {
      showEnd();
      return;
    }
    if (battle.pending[1]) await play(sendOut(battle, 1, chooseReplacement(battle, 1), rng));
    if (battle.pending[0]) {
      const to = (await pickPokemon(true))!;
      await play(sendOut(battle, 0, to, rng));
    }
    busy = false;
    renderMenu();
  }

  async function turn(action: Action): Promise<void> {
    if (busy || battle.winner !== null) return;
    busy = true;
    fast = false;
    menu.querySelectorAll('button').forEach((b) => (b.disabled = true));
    await play(executeTurn(battle, [action, chooseAction(battle, 1, rng)], rng));
    await afterTurn();
  }

  $('#exit').addEventListener('click', () => {
    if (o.confirmExit && battle.winner === null && !window.confirm('¿Salir del combate? No contará como jugado.')) return;
    o.onExit();
  });
  menu.innerHTML = '';
  void (async () => {
    addLog('¡Un entrenador rival quiere combatir!');
    await play(startBattle(battle, rng));
    busy = false;
    renderMenu();
  })();
}
