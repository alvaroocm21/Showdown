# Liga Pokémon aleatoria

Juego por turnos para móvil (uso personal): varios perfiles con equipos Pokémon aleatorios compiten en una liga.
Vive en esta subcarpeta; el resto del repositorio (el simulador Zafiro Alfa) no se toca.

## Desarrollo
```bash
npm install
npm run dev          # servidor local (también accesible desde el móvil en la misma red)
npm test             # tests unitarios (Vitest)
npm run build        # comprueba tipos y genera dist/
npm run fetch-data   # vuelve a descargar los datos de PokéAPI (solo si hace falta)
npm run make-icons   # regenera los iconos de la app (public/icons)
```

## Datos
`scripts/fetch-data.ts` descarga **una vez** los datos de PokéAPI (**todas las generaciones**: 1025 Pokémon, 846 ataques y
314 habilidades, con nombres en español; solo 3 habilidades recientes aún no tienen traducción y salen en inglés)
a `src/data/*.json`, que se guardan en el repositorio: el juego no necesita conexión para los datos.
Usa los CSV oficiales de PokéAPI en GitHub (mismos datos que la API, en pocos ficheros).
Los sprites son los renders 3D de Pokémon HOME que aloja PokéAPI.

## Estructura
- `src/core/` lógica pura sin DOM (RNG con semilla, datos, estadísticas, generador de equipos…).
- `src/core/battle/` motor de combate: `damage` (fórmula 5.ª gen+), `typeEffect`, `turnOrder`, `stages`, `engine` (turno → eventos), `log` (texto en español).
- `src/core/ai/` IA del rival.
- `src/core/game/` perfiles, calendario, clasificación, temporadas y operaciones sobre la partida (todo puro y con tests).
- `src/storage/` guardado en `localStorage`, validación, versionado y exportar/importar JSON.
- `src/ui/` estilos y pantallas. `tests/` pruebas unitarias.

## Reglas del sorteo
- 6 Pokémon distintos por equipo, de entre los que permitan los **ajustes del sorteo** (ver más abajo). Por defecto: las 9
  generaciones, con legendarios y singulares, solo en su última etapa evolutiva (568 Pokémon posibles).
- 4 ataques distintos de entre TODOS los del juego, repitiendo el sorteo si el set es injugable:
  mínimo 2 ataques de daño directo y, si es posible, al menos uno de un tipo del Pokémon.
- 1 habilidad de entre todas las del juego.
- Nivel 50, IV 31, EV 0, naturaleza neutra por defecto (ajustable en `BuildConfig`).

## Combate (fase 3: 6 contra 6)
Lógica pura en `src/core/battle/`; la interfaz solo reproduce los eventos que devuelve `executeTurn`.

- **Fórmula de daño** de 5.ª gen+: nivel 50, STAB ×1,5, tabla de 18 tipos, crítico ×1,5, variación 85-100 %, precisión y PP.
- **Orden:** los cambios van primero; después prioridad del ataque y velocidad (con parálisis y mejoras); empate al azar.
- **Equipos de 6** con cambio voluntario (un turno), reemplazo obligatorio al debilitarse y Pokémon atrapados por
  Sombra Trampa / Trampa Arena / Imán (los Fantasma siempre pueden huir).
- **Estados:** quemado (1/16, mitad de daño físico), paralizado (velocidad a la mitad, 25 % de no moverse),
  envenenado (1/8), gravemente envenenado (n/16), dormido (1-3 turnos) y congelado (20 % de deshielo; el fuego descongela).
  Un solo estado principal a la vez, con las inmunidades por tipo (fuego/quemadura, eléctrico/parálisis, veneno y acero/veneno, hielo/congelación).
- **Mejoras y bajadas** de -6 a +6 (Ataque, Defensa, At. Esp., Def. Esp., Velocidad, Precisión y Evasión); se pierden al cambiar.
- **Ataques implementados (645 de 846, el 76 %):** daño directo, multigolpe, drenaje, retroceso, ataques de dos turnos
  (Rayo Solar…), recarga (Hiperrayo…), Sorpresa, Explosión, daño fijo, KO de un golpe, potencia variable (Retorno, Magnitud, Plumas),
  estados, mejoras, curación y Descanso, además de efectos secundarios (estado, retroceso, bajadas/subidas de estadísticas).
- **Sin efecto aún** (se muestran en el menú como «sin efecto aún» y no hacen nada): clima, pantallas, Protección, Sustituto,
  confusión, Dulce Aroma/Drenadoras, Contraataque/Venganza, Foco Energía, Metrónomo, Transformación, ataques de salida forzada…
  Los ataques de dos turnos no tienen invulnerabilidad (Vuelo/Excavar solo hacen la preparación y el golpe).
- **Habilidades implementadas (54 de 314):** las del bloque inicial, las más comunes y sencillas; Intimidación, Levitación, Mar Llamas, Torrente, Espesura, Enjambre, Robustez,
  Absorbe Agua/Electricidad/Fuego, Pararrayos, Electricidad Estática, Punto Tóxico, Cuerpo Llama, Esporas, Piel Tosca,
  Superguarda, Potencia, Poder Puro, Agallas, Escama Especial, Sebo, Impulso, Sincronía, Cura Natural, Muda, Cuerpo Puro, Humo Blanco,
  Garra Dura, Vista Lince, Flexibilidad, Insomnio, Espíritu Vital, Inmunidad, Velo Agua, Armadura Magma, Armadura Batalla, Caparazón,
  Polvo Escudo, Foco Interno, Cambio Color, Cabeza Roca, Dicha, Ojo Compuesto, Madrugar, Presión, Letargo, Humedad, Insonorizar,
  Viscosecreción, Sombra Trampa, Trampa Arena e Imán. Las demás (clima, Calco…) se muestran sin efecto.
- **Desempate:** si caen los dos últimos Pokémon en el mismo turno gana el bando cuyo Pokémon cayó el último
  (por ejemplo, quien usó Explosión pierde).
- **IA** (`src/core/ai/`): valora daño esperado (tipos, STAB, precisión, golpes), estados, mejoras y curación con algo de ruido;
  cambia si no puede dañar al rival o está en clara desventaja con un compañero mucho mejor; elige el reemplazo con mejor enfrentamiento.
- `simulateBattle` juega un combate completo IA contra IA (unos 4 ms): se usará para los combates de la liga que no juegue el usuario.

## Liga y perfiles (fase 4)
- **Perfiles:** cada uno con su nombre, avatar y un equipo de 6 Pokémon aleatorios. ★ marca los perfiles principales.
  El primero de la lista es el que sale al combate; se puede reordenar. El equipo solo se puede re-sortear con la liga parada o terminada.
- **Liga:** de 4 a 8 perfiles, todos contra todos a una vuelta (método del círculo; con número impar descansa uno por jornada).
  3 puntos por victoria, 0 por derrota. Clasificación con PJ, PG, PP, DIF (Pokémon rivales debilitados − propios) y puntos;
  desempata por DIF, luego por Pokémon rivales debilitados y por último por nombre.
- **Cada combate:** juegas con el perfil que elijas de la pareja. Los combates donde no interviene ningún perfil principal ★
  también se pueden **simular** (IA contra IA), uno a uno o toda la jornada; los de un perfil principal se juegan a mano.
- **Fin de temporada:** campeón, historial de temporadas y botón para empezar otra.
- **Guardado:** automático en `localStorage` (perfiles, equipos, liga, resultados e historial). En Ajustes se puede
  **exportar** la partida a un fichero JSON, **importarla** (se valida todo: Pokémon, ataques, habilidades, calendario…) o borrarla.
  El formato lleva versión (`version`) y hay un sitio para migraciones (`src/storage/save.ts`). Si la partida guardada
  está corrupta se avisa, se guarda una copia aparte (`pokeliga:backup`) y se empieza de cero.

## Monedas y mejoras (fase 5)
- **Ganar da monedas** al perfil vencedor, tanto si se juega como si se simula: **100 + 10 por cada Pokémon propio que
  sobreviva** (de 100 a 160). El premio se ve al terminar el combate y en el pie de cada combate de la liga.
- **Mejoras** (en la ficha de cada perfil, panel «🛒 Mejorar con monedas» de cada Pokémon). Todas son sorteos al azar y no se pueden deshacer:
  | Mejora | Precio |
  |---|---|
  | Re-sortear 1 ataque (sigue siendo un set jugable: ≥ 2 ataques de daño y, si se puede, uno de su tipo) | 60 🪙 |
  | Re-sortear la habilidad (entre todas las del juego) | 80 🪙 |
  | Sustituir el Pokémon por otro nuevo (última etapa, que no esté ya en el equipo; conserva nivel e IVs/EVs/naturaleza) | 150 🪙 |
- Las mejoras con monedas se pueden comprar también **durante la temporada**; los sorteos gratuitos del equipo no.
- Precios y premios: `src/core/game/economy.ts`. La tienda es lógica pura: `src/core/game/shop.ts`.

## App instalable y sin conexión (PWA)
- Se instala desde el menú del navegador («Añadir a pantalla de inicio»); en Ajustes aparece además un botón «Instalar la app»
  cuando el navegador lo permite.
- `npm run build` genera `dist/sw.js` (service worker con la lista de ficheros y una versión que cambia con el contenido):
  la app entera se guarda al abrirla la primera vez y arranca sin red.
- Los **sprites 3D** se guardan a medida que se ven; en Ajustes hay un botón para **descargar de golpe todos los que pueden salir** (con los ajustes por defecto, 568 sprites ≈ 80 MB; se calcula según tus ajustes).
  Sin imagen guardada y sin red se muestra una Poké Ball. Los datos del juego (Pokémon, ataques, habilidades) ya van dentro de la app.
- Los iconos se generan sin dependencias con `npm run make-icons`.
- **APK de Android**: `liga/releases/LigaPokemon.apk` (se regenera con `npm run build && android/build.sh`). Firmada con clave de depuración: para uso personal.
- Para publicarla hace falta servir `dist/` por HTTPS (p. ej. GitHub Pages); el service worker no funciona desde `file://`.

## Retoques visuales
Cinco ambientes de arena al azar, sacudida de pantalla en los críticos, confeti al ganar y al coronar campeón, barra de PS que
parpadea cuando queda poca vida, transición entre pantallas y respeto a «reducir movimiento».

## Todos los Pokémon, ataques y habilidades
- **Datos completos:** 1025 Pokémon (las 9 generaciones), 846 ataques y 314 habilidades. Se excluyen los movimientos Z y Dinamax,
  que no se pueden usar sueltos (se necesita un objeto o una mecánica concreta), y los Pokémon de formas alternativas
  (regionales, megaevoluciones…): se sortean las especies base.
- **Ataques y habilidades:** salen siempre de **todos** los del juego. Los que el motor aún no implementa se muestran con «sin efecto aún».
- **Ajustes del sorteo** (pestaña Ajustes → «Pokémon del sorteo»): qué generaciones entran, si se incluyen legendarios y singulares y si
  solo salen Pokémon en su última etapa. Afecta a los equipos nuevos, a los sorteos gratis y a los Pokémon comprados con monedas;
  los equipos que ya existen no cambian. Se guarda con la partida (formato versión 2; las partidas antiguas se migran solas).
- Tras ampliar los datos, las pruebas automáticas usan cada una de las 1025 especies, los 846 ataques y las 314 habilidades en combate.

## Formas regionales, megaevoluciones y movimientos Z

- **Formas regionales** (Alola, Galar, Hisui, Paldea): 57 formas que salen en el sorteo como cualquier otra especie (sus generaciones se cuentan por la forma base).
- **Megaevoluciones** (97 formas, incluidas Mega X/Y): no se sortean; son una mecánica de combate. Una vez por combate y bando, antes de atacar, el botón «✨ Mega-…» transforma al Pokémon (recalcula estadísticas y tipos; conserva su habilidad aleatoria y los PS perdidos). Dura hasta el final del combate, aunque se le cambie. Las tarjetas muestran las megas posibles.
- **Movimientos Z**: una vez por combate y bando, el botón «⚡ Mov. Z» convierte los ataques de daño en su versión Z (potencia según el original, no fallan). Los de estado quedan bloqueados mientras está activo.
- El combate usa un escenario horizontal 960×540 como Zafiro Alfa (en vertical se gira solo; mejor con el móvil en horizontal): paneles de PS arriba-izquierda y abajo-derecha, cuadro de texto y ataques abajo, y tus Pokémon de espaldas.
- No hay Teracristalización (ni Terapagos ni los ataques Tera Blast y Tera Starstorm: no se sortean y se cambian en partidas antiguas), Dinamax ni Gigamax, ni formas Primigenias.

### Habilidades
310 habilidades: **252 implementadas** y **58 marcadas «no aplica»** con el motivo (dobles, objetos, bonus de dinero…); un test comprueba que todas están en un grupo u otro. También hay clima (sol, lluvia, arena, nieve y climas extremos), terrenos, confusión, Canto Mortal, Anulación y cambios forzados.

Límites conocidos: los cambios de «Retirada»/«Pies Veloces» tipo Retirada Forzosa (Huida/Retirada) se resuelven al final del turno; no hay cambios elegidos a mitad de turno por ataques pivote.

## Plantilla de 15, alineaciones y historial
- Cada perfil tiene **15 Pokémon distintos**. En cada combate salen **6**, que se eligen antes (el primero sale al campo). Las partidas antiguas se completan a 15 al abrirlas.
- Un Pokémon **debilitado en un combate no puede jugar la jornada siguiente** (se ve en gris en el selector y en la jornada).
- Combate entre **dos perfiles tuyos (★)**: eliges el equipo de los dos y juegas con el local; el visitante lo lleva la IA. Con un solo perfil tuyo eliges el tuyo y el rival se alinea solo. Los combates sin perfiles ★ se simulan con alineaciones automáticas (los 6 más fuertes disponibles).
- **Calendario → Historial**: victorias, Pokémon derribados y lista de combates de liga entre dos cuentas (todas las temporadas, desde esta versión).
