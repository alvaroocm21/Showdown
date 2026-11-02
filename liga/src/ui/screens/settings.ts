import { GENERATION_NAMES, poolSize, speciesPerGeneration, totalDrawable, validateDraw } from '../../core/game/settings';
import { updateDraw } from '../../core/game/state';
import { ALL_GENERATIONS, emptyGame, type DrawSettings } from '../../core/game/types';
import { cloud } from '../../storage/cloud';
import { exportGame, importGame, SaveError } from '../../storage/save';
import type { AppCtx } from '../app';
import { canInstall, isInstalled, promptInstall } from '../install';
import { cachedSpriteCount, downloadSprites, estimatedMegabytes, neededSpriteIds, offlineSupported } from '../offline';

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountSettings(ctx: AppCtx): void {
  const state = ctx.store.get();
  const draw = state.settings.draw;
  const perGen = speciesPerGeneration();
  const genChips = ALL_GENERATIONS.map(
    (g) => `<label class="gen${draw.generations.includes(g) ? ' on' : ''}"><input type="checkbox" data-gen="${g}" ${draw.generations.includes(g) ? 'checked' : ''} />
      <b>${g}</b><span>${GENERATION_NAMES[g]}</span><small>${perGen[g] ?? 0}</small></label>`,
  ).join('');
  const sprites = neededSpriteIds(state).length;
  ctx.root.innerHTML = `
    <h1>Ajustes</h1>
    <p class="sub">Partida · ${state.profiles.length} perfiles · ${state.history.length} temporadas jugadas</p>
    <section class="card form" id="draw">
      <h3>Pokémon del sorteo</h3>
      <p class="muted">Qué Pokémon pueden salir en equipos nuevos, sorteos gratis y al comprar un Pokémon. Los equipos que ya existen no cambian. Ataques y habilidades salen siempre de <b>todos</b> los del juego (${totalDrawable()} Pokémon en total, con las formas regionales).</p>
      <div class="gens">${genChips}</div>
      <label class="check"><input type="checkbox" id="legend" ${draw.legendaries ? 'checked' : ''} /> Incluir legendarios y singulares</label>
      <label class="check"><input type="checkbox" id="finalonly" ${draw.finalStageOnly ? 'checked' : ''} /> Solo Pokémon en su última etapa evolutiva</label>
      <p class="okmsg" id="poolmsg">${poolSize(draw)} Pokémon distintos pueden salir</p>
    </section>
    <section class="card form" id="offline">
      <h3>Instalar y jugar sin conexión</h3>
      <p class="muted" id="installmsg"></p>
      <button class="main" id="install" hidden>📲 Instalar la app</button>
      <p class="muted" id="offstatus">Comprobando imágenes guardadas…</p>
      <div class="progress light" id="offprog" hidden><i id="offbar"></i></div>
      <button class="alt" id="offdl" hidden>⬇️ Descargar las imágenes (≈ ${estimatedMegabytes(sprites)} MB)</button>
      <small class="muted">Los datos del juego ya van dentro de la app; solo las imágenes de los Pokémon se bajan de internet.</small>
    </section>
    <section class="card form" id="account"></section>
    <section class="card form">
      <h3>Guardado</h3>
      <p class="${ctx.store.persisted ? 'okmsg' : 'err'}">${ctx.store.persisted ? '✅ Se guarda automáticamente en este navegador.' : '⚠️ No se puede guardar en este navegador.'}</p>
      <button class="main" id="export">⬇️ Exportar partida (JSON)</button>
      <button class="alt" id="copy">📋 Copiar al portapapeles</button>
    </section>
    <section class="card form">
      <h3>Importar partida</h3>
      <p class="muted">Sustituye la partida actual por la del fichero.</p>
      <input type="file" id="file" accept="application/json,.json" />
      <small id="importmsg" class="err"></small>
    </section>
    <section class="card form">
      <h3>Zona peligrosa</h3>
      <button class="alt" id="reset">🗑 Borrar toda la partida</button>
    </section>`;

  const $ = <T extends HTMLElement>(sel: string) => ctx.root.querySelector<T>(sel)!;

  // Cuenta: la partida se copia a tu correo y se recupera en cualquier móvil, aunque desinstales la app
  const accountEl = $('#account');
  const STATUS_TEXT = { off: '', sync: '⏳ Sincronizando…', ok: '✅ Copia al día', error: '⚠️ No se pudo sincronizar (sin conexión). Se reintentará al guardar.' };
  function renderAccount(msg = ''): void {
    const u = cloud.user();
    if (u) {
      accountEl.innerHTML = `<h3>Cuenta y copia en la nube</h3>
        <p>Conectado como <b>${u.email ?? 'tu cuenta'}</b></p>
        <p class="muted" id="syncstatus">${STATUS_TEXT[ctx.sync.status()]}</p>
        <p class="muted">Tu partida se guarda en tu cuenta cada vez que cambia. Si desinstalas la app, entra con el mismo correo y se recupera.</p>
        <button class="main" id="syncnow">🔄 Sincronizar ahora</button>
        <button class="alt" id="signout">Cerrar sesión</button>`;
      accountEl.querySelector('#syncnow')!.addEventListener('click', () => void ctx.sync.now());
      accountEl.querySelector('#signout')!.addEventListener('click', async () => {
        await cloud.signOut();
        renderAccount();
      });
      return;
    }
    accountEl.innerHTML = `<h3>Cuenta y copia en la nube</h3>
      <p class="muted">Entra con tu correo para guardar la partida en la nube y recuperarla aunque desinstales la app o cambies de móvil.</p>
      <label>Correo<input id="accmail" type="email" autocomplete="email" inputmode="email" /></label>
      <label>Contraseña<input id="accpass" type="password" autocomplete="current-password" /></label>
      <small id="accmsg" class="err">${msg}</small>
      <button class="main" id="accin">Entrar</button>
      <button class="alt" id="acccreate">Crear cuenta</button>
      ${cloud.googleOk() ? '<button class="alt" id="accgoogle">Entrar con Google</button>' : ''}
      <button class="alt small" id="accreset">He olvidado la contraseña</button>`;
    const val = () => ({ mail: ($<HTMLInputElement>('#accmail').value || '').trim(), pass: $<HTMLInputElement>('#accpass').value });
    const done = (r: { error?: string }) => {
      if (r.error) accountEl.querySelector('#accmsg')!.textContent = r.error;
    };
    accountEl.querySelector('#accin')!.addEventListener('click', async () => done(await cloud.signIn(val().mail, val().pass, false)));
    accountEl.querySelector('#acccreate')!.addEventListener('click', async () => done(await cloud.signIn(val().mail, val().pass, true)));
    accountEl.querySelector('#accgoogle')?.addEventListener('click', async () => done(await cloud.signInGoogle()));
    accountEl.querySelector('#accreset')!.addEventListener('click', async () => {
      const r = await cloud.resetPassword(val().mail);
      const el = accountEl.querySelector('#accmsg')!;
      el.className = r.error ? 'err' : 'okmsg';
      el.textContent = r.error ?? 'Te hemos enviado un correo para cambiar la contraseña.';
    });
  }
  renderAccount();
  const offAuth = cloud.onChange(() => (accountEl.isConnected ? renderAccount() : offAuth()));
  const offSync = ctx.sync.onStatus(() => {
    if (!accountEl.isConnected) return offSync();
    const el = accountEl.querySelector('#syncstatus');
    if (el) el.textContent = STATUS_TEXT[ctx.sync.status()];
  });

  // Ajustes del sorteo
  const readDraw = (): DrawSettings => ({
    generations: [...ctx.root.querySelectorAll<HTMLInputElement>('[data-gen]')].filter((c) => c.checked).map((c) => Number(c.dataset.gen)),
    legendaries: $<HTMLInputElement>('#legend').checked,
    finalStageOnly: $<HTMLInputElement>('#finalonly').checked,
  });
  const onDrawChange = (): void => {
    const next = readDraw();
    const error = validateDraw(next);
    if (error) {
      ctx.toast(error);
      mountSettings(ctx);
      return;
    }
    ctx.store.commit(updateDraw(ctx.store.get(), next));
    mountSettings(ctx);
  };
  ctx.root.querySelectorAll<HTMLInputElement>('[data-gen], #legend, #finalonly').forEach((c) => c.addEventListener('change', onDrawChange));

  // Instalación
  const installMsg = $('#installmsg');
  if (isInstalled()) installMsg.textContent = '✅ Estás usando la app instalada.';
  else if (canInstall()) {
    installMsg.textContent = 'Añádela a la pantalla de inicio para usarla como una app.';
    $('#install').hidden = false;
    $('#install').addEventListener('click', async () => {
      if (await promptInstall()) ctx.toast('¡App instalada!');
      mountSettings(ctx);
    });
  } else installMsg.textContent = 'Para instalarla: menú del navegador → «Añadir a pantalla de inicio» (en iPhone: Compartir → Añadir a pantalla de inicio).';

  // Imágenes sin conexión. Las referencias se guardan al principio: las comprobaciones son asíncronas y la
  // pantalla puede haber cambiado cuando terminan.
  const status = $('#offstatus');
  const dlButton = $<HTMLButtonElement>('#offdl');
  const stillHere = () => dlButton.isConnected;
  if (!offlineSupported()) status.textContent = 'Este navegador no permite guardar imágenes para jugar sin conexión.';
  else {
    void cachedSpriteCount(ctx.store.get()).then(({ cached, total }) => {
      if (!stillHere()) return;
      status.textContent = cached >= total ? `✅ Las ${total} imágenes están guardadas: puedes jugar sin conexión.` : `Imágenes guardadas: ${cached} de ${total}. Las que faltan se ven como una Poké Ball sin conexión.`;
      if (cached < total) dlButton.hidden = false;
    });
    dlButton.addEventListener('click', async () => {
      const prog = $('#offprog');
      const bar = $('#offbar');
      dlButton.disabled = true;
      prog.hidden = false;
      const { saved, failed } = await downloadSprites(ctx.store.get(), (done, total) => {
        bar.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
        status.textContent = `Descargando… ${done} de ${total}`;
      });
      ctx.toast(failed ? `${saved} guardadas, ${failed} fallaron (¿sin conexión?)` : `Listo: ${saved} imágenes guardadas`);
      if (stillHere()) mountSettings(ctx); // solo si sigues en Ajustes
    });
  }

  $('#export').addEventListener('click', () => {
    const day = new Date().toISOString().slice(0, 10);
    download(`liga-pokemon-${day}.json`, exportGame(ctx.store.get()));
    ctx.toast('Partida exportada');
  });

  $('#copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(exportGame(ctx.store.get()));
      ctx.toast('Copiada al portapapeles');
    } catch {
      ctx.toast('No se pudo copiar; usa «Exportar»');
    }
  });

  $<HTMLInputElement>('#file').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    const msg = $('#importmsg');
    msg.textContent = '';
    if (!file) return;
    try {
      const imported = importGame(await file.text());
      if (!window.confirm(`¿Sustituir la partida actual por la del fichero (${imported.profiles.length} perfiles, ${imported.history.length} temporadas)?`)) {
        input.value = '';
        return;
      }
      ctx.store.commit(imported);
      ctx.toast('Partida importada');
      mountSettings(ctx);
    } catch (err) {
      msg.textContent = err instanceof SaveError ? err.message : 'No se pudo leer el fichero';
      input.value = '';
    }
  });

  $('#reset').addEventListener('click', () => {
    if (!window.confirm('¿Borrar TODA la partida (perfiles, equipos, liga e historial)? Exporta antes una copia si la quieres.')) return;
    ctx.store.commit(emptyGame());
    ctx.toast('Partida borrada');
    ctx.go({ name: 'league' });
  });
}
