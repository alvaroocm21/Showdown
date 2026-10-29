import { emptyGame } from '../../core/game/types';
import { exportGame, importGame, SaveError } from '../../storage/save';
import type { AppCtx } from '../app';
import { canInstall, isInstalled, promptInstall } from '../install';
import { cachedSpriteCount, downloadSprites, estimatedMegabytes, offlineSupported } from '../offline';

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
  ctx.root.innerHTML = `
    <h1>Ajustes</h1>
    <p class="sub">Partida · ${state.profiles.length} perfiles · ${state.history.length} temporadas jugadas</p>
    <section class="card form" id="offline">
      <h3>Instalar y jugar sin conexión</h3>
      <p class="muted" id="installmsg"></p>
      <button class="main" id="install" hidden>📲 Instalar la app</button>
      <p class="muted" id="offstatus">Comprobando imágenes guardadas…</p>
      <div class="progress light" id="offprog" hidden><i id="offbar"></i></div>
      <button class="alt" id="offdl" hidden>⬇️ Descargar las imágenes (≈ ${estimatedMegabytes()} MB)</button>
      <small class="muted">Los datos del juego ya van dentro de la app; solo las imágenes de los Pokémon se bajan de internet.</small>
    </section>
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

  // Imágenes sin conexión
  const status = $('#offstatus');
  if (!offlineSupported()) status.textContent = 'Este navegador no permite guardar imágenes para jugar sin conexión.';
  else {
    void cachedSpriteCount().then(({ cached, total }) => {
      status.textContent = cached >= total ? `✅ Las ${total} imágenes están guardadas: puedes jugar sin conexión.` : `Imágenes guardadas: ${cached} de ${total}. Las que faltan se ven como una Poké Ball sin conexión.`;
      if (cached < total) $('#offdl').hidden = false;
    });
    $('#offdl').addEventListener('click', async () => {
      const button = $<HTMLButtonElement>('#offdl');
      const prog = $('#offprog');
      const bar = $('#offbar');
      button.disabled = true;
      prog.hidden = false;
      const { saved, failed } = await downloadSprites((done, total) => {
        bar.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
        status.textContent = `Descargando… ${done} de ${total}`;
      });
      ctx.toast(failed ? `${saved} guardadas, ${failed} fallaron (¿sin conexión?)` : `Listo: ${saved} imágenes guardadas`);
      mountSettings(ctx);
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
