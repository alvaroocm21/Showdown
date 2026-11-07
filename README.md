# Pokémon Zafiro Alfa · Duelos

Simulador de combates por turnos con estética de Zafiro Alfa / Rubí Omega.
Forma tu equipo con **cualquier Pokémon de cualquier generación** (1290 especies y formas),
con **cualquier movimiento, habilidad y objeto**, y combate contra líderes de gimnasio, el Alto Mando
y villanos de Hoenn.

## Jugar
Abre `index.html` en el navegador (necesita internet para los sprites).
O sirve la carpeta: `python -m http.server` y entra en http://localhost:8000.
Hay que mantener junta la carpeta del proyecto: `index.html` carga `lib/pkmn.bundle.js`.

## Instalar en el móvil (app instalable / PWA)
La web es una PWA: se instala con icono en la pantalla de inicio, a pantalla completa y funciona sin conexión
una vez cargada (los sprites que ya has visto también se guardan). Para usarla desde el móvil hay que publicarla
en una dirección web (HTTPS); la forma más sencilla es **GitHub Pages**:

1. En GitHub abre el repositorio → **Settings → Pages**.
2. En *Build and deployment* elige **Deploy from a branch**, rama `claude/determined-volta-xj4u9a` (o `main` si
   la has fusionado) y carpeta **/ (root)** → *Save*.
3. En uno o dos minutos la web estará en `https://<tu-usuario>.github.io/showdown/`.
4. Ábrela en el móvil:
   - **Android (Chrome):** botón **📲 Instalar app** de la pantalla de inicio, o menú ⋮ → *Instalar aplicación*.
   - **iPhone/iPad (Safari):** **Compartir** ⬆️ → **Añadir a pantalla de inicio**.

Se juega mejor en **horizontal** (en vertical aparece un aviso). Cualquier otro alojamiento estático sirve igual
(Netlify, Cloudflare Pages, Vercel…): basta con subir la carpeta del proyecto.

## APK de Android
`dist/PokemonDuelos.apk` es la misma web empaquetada en una app de Android (una ventana WebView a pantalla
completa; los sprites se descargan de internet). Para instalarla, descárgala en el móvil y ábrela (hay que permitir
«instalar apps de orígenes desconocidos» para el navegador o el gestor de archivos). Va firmada con una clave de
depuración incluida en `android/debug.keystore`, así que sirve para uso personal, no para Google Play.
Para regenerarla tras cambiar la web: `android/build.sh` (necesita `aapt`, `apksigner`, `zipalign`, `zip`, un JDK y
`android-sdk-platform-23`, todo disponible con `apt` en Ubuntu/Debian).

## Jugadores y Randomlocke
- Al entrar eliges **quién juega** (o creas un jugador nuevo): sin cuenta ni contraseña, los datos de cada
  jugador (equipo, medallas y aventura) se guardan por separado en este navegador.
- **🎲 Randomlocke**: aventura por Hoenn de 31 etapas (rutas, gimnasios, equipos Magma/Aqua, Alto Mando y
  Campeón) en la que solo combates. Empiezas con un inicial aleatorio; en cada ruta te enfrentas a un
  entrenador y a un Pokémon salvaje que capturas al derrotarlo (uno por ruta, sin repetir familia).
  Todos tus Pokémon tienen **habilidad, objeto y naturaleza aleatorios**; tras cada gimnasio hay una
  **tienda con objetos aleatorios** (dinero ganado en los combates). Tu equipo sube de nivel y evoluciona
  solo, se cura tras cada combate y, con la opción de **muerte permanente**, los debilitados se pierden.

## Gráficos y animaciones (estilo 9.ª gen)
Por defecto el juego usa el estilo **Escarlata/Púrpura** (el botón 🎨 de la pantalla de inicio cambia al de
**Zafiro Alfa**; se recuerda entre sesiones):
- **Tus Pokémon se ven de espaldas** (sprites 3D animados de Showdown, que sí tienen vista trasera) y los del
  rival de frente en HD. Con el botón 👀 de la pantalla de inicio puedes ver los tuyos también de frente en HD.
- **Rival:** renders 3D de Pokémon HOME (los modelos de 8.ª/9.ª gen) desde el repositorio
  [PokeAPI/sprites](https://github.com/PokeAPI/sprites), recortados y escalados según la altura de cada especie,
  con perspectiva (el tuyo más cerca), sombra y animación de respiración. Si no cargan, se usan los sprites
  animados de Showdown. El estilo Zafiro Alfa usa los sprites animados de 6.ª gen.
- **Escenarios** dibujados por código: pradera de Paldea (día o atardecer) y **estadios de gimnasio** con
  público, focos y suelo luminoso del tipo del líder.
- **Animaciones de movimientos:** cada movimiento tiene su propia animación compuesta (no son las originales
  de Nintendo). Hay animaciones hechas a medida para los más emblemáticos (Lanzallamas, Hidrobomba, Rayo, Trueno,
  Hiperrayo, Rayo Solar, Bola Sombra, Psíquico, A Bocajarro, Envite Ígneo, Pájaro Osado, Cometa Draco, Fuerza Lunar,
  Danza Espada, Terremoto, Surf, Roca Afilada, Huracán…), unas 35 familias (puñetazos, patadas, garras, mordiscos,
  colas, agujas, chorros, vórtices, pilares, rocas que emergen, polvos, drenajes, confusión, hipnosis, pantallas,
  clima, terrenos, zambullidas, giros, embestidas con aura, notas musicales…) asignadas a cientos de movimientos y,
  para el resto, una variación propia generada a partir de la identidad del movimiento (tipo, forma de golpear,
  número de proyectiles, trayectoria y decoración del impacto). Los impactos añaden destello, anillos, líneas de
  velocidad, partículas del tipo, zoom y temblor de cámara.
- **Interfaz:** paneles con barra de PS con estela de daño, estado, Teracristal y mejoras de estadísticas;
  menú de movimientos con iconos de tipo.
- **Teracristalización** con cristales, estallido, brillo facetado sobre el modelo y corona del tipo.

## Motor de combate
Las reglas las pone el simulador oficial de Pokémon Showdown (`@pkmn/sim`, formato *Custom Game* de 9ª gen),
así que están implementadas todas las mecánicas reales: ~320 habilidades, ~550 objetos, ~860 movimientos,
clima y terrenos, trampas de entrada, estados, megaevoluciones, movimientos Z, Teracristalización, etc.
La interfaz traduce los eventos del combate al español (los textos poco comunes salen en inglés).

- **Equipo:** buscador por nombre/número, filtros por generación y tipo, nivel, naturaleza, EVs/IVs,
  teratipo, habilidad (de la especie o cualquiera), objeto y 4 movimientos (todos o solo los que aprende).
  Botón ✨ para sugerir movimientos. Importa/exporta equipos en formato Showdown.
- **Rivales:** 15 entrenadores de Hoenn con IA que evalúa daño, tipos, estados, mejoras y cambios
  tácticos, además de *Rival aleatorio* (6 Pokémon cualquiera) y el **Desafío de la Liga**
  (Sidney, Phoebe, Glacia, Drake y Máximo seguidos).
- Sprites 3D animados de Pokémon Showdown. Si no cargan, se muestra un marcador por tipo.
- Equipo y medallas se guardan en `localStorage`.

## 🎮 Editor ROM y 🏟 Liga (dos apartados en la portada)
**🎮 Editor ROM** (lo principal): lleva a la ROM de 3DS (Rubí Omega / Zafiro Alfa o Ultra Sol / Ultra Luna, descifrada, con o sin mod en .zip)
los equipos de la jornada elegida. Los combates se juegan en el juego.
1. Elige el `.3ds` (se lee en el dispositivo, no se sube) y, si lo usas, el mod `.zip`.
2. Elige la jornada y asigna a cada entrenador de la liga uno del juego (a mano, en bloque desde un entrenador, o sugeridos).
   Los nombres se casan en inglés (o español) con los textos de la ROM, así que funciona con mods que añaden Pokémon de 8.ª/9.ª gen.
   Lo que no existe en la ROM se omite y se avisa. Las megaevoluciones se escriben como el Pokémon base con su megapiedra.
3. Descarga un `.zip` con `<TitleID>/romfs/...` (solo los archivos de entrenadores y los textos en español con los nombres) para `load/mods/`
   de Azahar/Citra o `luma/titles/` de una 3DS. En Chrome de escritorio también puede guardar directamente en una carpeta.
   También hay un explorador de archivos de la ROM (lista y descarga de archivos concretos).

**🏟 Liga** (consulta y gestión): varias competiciones a la vez, con los mismos entrenadores en todas.
- **Competiciones:** arriba eliges o creas una (**🏟 Liga**, **🏆 Copa** o **⭐ Champions**). Todas pueden jugarse a la vez. Cada entrenador entra en las que tú elijas
  (en su ficha o en Ajustes → Participantes). Por defecto, un entrenador nuevo entra en la competición abierta. Su equipo es el mismo en todas hasta que lo cambias en una jornada;
  cada jornada hereda el equipo de la anterior (no se duplica), así que puedes tener 38 jornadas sin llenar el almacenamiento.
- **Liga:** calendario completo a **1 vuelta** o **2 vueltas** (ida y vuelta) con un botón; clasificación con colores (verde ascenso, naranja playoff, rojo descenso,
  configurables), con el **escudo** de cada entrenador junto a su nombre, con **GF y GC** (Pokémon derrotados a favor y en contra; al anotar un combate se pide el marcador, de 0 a 6, y se puede corregir con ✎; sin marcador cuenta 1–0; el desempate es por diferencia y luego GF), sin nada más debajo; los combates y el cara a cara están en Calendario, y el cierre de temporada en Ajustes, forma de los últimos 5 partidos y cara a cara.
- **Copa:** sorteo aleatorio (o por orden de la lista) del cuadro, partido único o ida y vuelta (la final es única). Si no son potencia de 2, descansan los primeros del sorteo.
  Los partidos se crean solos según se decide cada eliminatoria; si una eliminatoria a ida y vuelta queda empatada, eliges quién pasa.
- **Champions (formato nuevo):** fase de liga en la que cada uno juega N rivales distintos; los mejores pasan directos, los siguientes juegan un playoff a ida y vuelta y los demás
  quedan fuera; después, eliminatorias hasta la final. Con 36 entrenadores es exactamente el formato real (8 directos, 16 de playoff, 12 fuera); con otros números se adapta.
- **🟨 Tarjetas y 📊 estadísticas de Pokémon:** al anotar un combate se marcan los Pokémon que se debilitaron en cada equipo; cada uno recibe una **amarilla** y, a la 2.ª, **se pierde el siguiente
  partido** (🟥). El sancionado aparece desactivado en el combate siguiente y **no se incluye en el equipo que se exporta a la ROM** (se avisa al exportar). De los debilitados salen también GF y GC.
  La pestaña **Estadísticas** muestra, por Pokémon, partidos jugados, amarillas y sanciones (de la competición o de todas), los más jugados, los más amonestados y los sancionados ahora; cada
  Pokémon enseña también sus cifras en la ficha del entrenador. Todo se calcula repasando los combates, así que borrar o corregir uno lo recalcula bien.
- **📅 Calendario:** elige quién eres («⭐ Este soy yo») y verás tus próximos partidos de **todas** las competiciones, con su fecha, y tu racha (victorias/empates/derrotas seguidas,
  últimos 5, mejor racha). «Gané / Empate / Perdí» lo anota y da las monedas.
- **🎲 Sorteo de equipos:** reparte Pokémon al azar entre los participantes (solo a los que no tienen equipo, o a todos) para la jornada actual, y al crear una competición hay una casilla para sortear
  en el momento. Se elige cuántos Pokémon por equipo, el nivel, hasta qué generación, si solo totalmente evolucionados, si entran legendarios y míticos, y si se repiten entre entrenadores.
  «Azar total» da habilidad, objeto, naturaleza y ataques al azar (entre todo lo que hay en el juego; con al menos 2 de daño); «Coherente» usa una habilidad de su especie y ataques sugeridos.
  Con la ROM abierta solo salen Pokémon, ataques, habilidades y objetos que existen en ella. Lógica en `lib/ligasorteo.js`.
- **Jugadores = entrenadores de la liga:** la pantalla de entrada («¿Quién juega?») lista a los entrenadores de las ligas, con su color y su escudo, y al entrar como uno de ellos «tú» pasa a ser ese
  jugador en el calendario y la racha. Un jugador nuevo creado en la entrada entra en la competición abierta; borrarlo lo quita también de las ligas (y sus combates). Hay 24 colores y un selector libre.
- **⚡ Porcentaje de calidad:** cada entrenador puede tener un porcentaje (0–100) en su ficha o en el sorteo; el sorteo le da Pokémon acordes: con **90** salen los más fuertes (por suma de estadísticas base, como un equipo
  de élite), con 50 unos medios y con 20 los más flojos (el azar se reparte alrededor de ese puesto). Etiquetas: Élite (90+), Alto (70+), Medio (40+), Bajo (20+), Humilde. Sin porcentaje usa el de por defecto
  del sorteo, y se puede apagar para repartir todo al azar. Hay botones para poner porcentajes al azar o quitarlos.
- **Tu equipo de «Elegir equipo» en la Liga:** si un entrenador no tiene equipo propio en la liga, se usa el que ese jugador ya tenía en «Elegir equipo» (los 6 primeros son los titulares). En cuanto lo edites en la
  liga, la liga guarda el suyo y el de «Elegir equipo» no cambia.
- **Escudos:** cada entrenador y cada competición puede llevar una imagen (de la galería, se guarda reducida a 96 px) o solo un color (paleta o color libre); sin imagen se ve el emoji sobre el color.
- **🛡 Equipo:** tu plantilla (hasta 12 Pokémon por competición y jornada, que se edita con el editor de equipos de la app) con cada Pokémon al detalle (habilidad, objeto, naturaleza, ataques, estadísticas,
  partidos jugados y tarjetas) y la **elección de tus 6 titulares**: los 6 primeros son los que juegan y el resto el banquillo; con «Hacer titular» / «Cambiar por un suplente» los intercambias.
  Si un titular está sancionado (2 🟨), no juega y entra un suplente, tanto en el marcador como al exportar a la ROM (que siempre escribe solo los 6 que juegan). Se puede ver el equipo de cualquier entrenador.
- **👥 Entrenadores:** tarjetas con récord, forma y competiciones; la ficha enseña cada Pokémon al detalle (tipos, habilidad, objeto, naturaleza, ataques, estadísticas, EVs/IVs).
- **🪙 Tienda:** cada combate da monedas (victoria 100, empate 50, derrota 25; configurable), que valen para todas las competiciones: habilidad al azar, naturaleza (elegir o al azar),
  ataque (elegir o al azar), objeto al azar o IVs a 31 (al azar entre todo lo que hay en el juego; con la ROM abierta, solo lo que existe en ella).
- **📜 Historial:** cada temporada o edición cerrada con su clasificación, cuadro, combates y equipos de cada jornada.
- **⚙ Ajustes:** nombre, participantes, formato de la competición, premios y precios, copia de seguridad de todo.

Notas: en ORAS la ROM no guarda naturaleza ni EVs de los entrenadores (USUM sí). La APK (v1.1) permite elegir la ROM y guarda los .zip en Descargas
(sin probar en dispositivo real). Código: `lib/romcore.js` (lectura/escritura de ROM, GARC, entrenadores), `lib/ligamap.js` (Showdown → ROM), `lib/liga.js`
(datos comunes y Editor ROM), `lib/ligahub.js` (pantalla Liga), `lib/ligacal.js` (calendarios, rachas y eliminatorias), `lib/ligashop.js` (tienda), `lib/liga.css`.
Pruebas: `python3 test/make_rom.py test/out/fake.3ds oras && python3 test/make_rom.py test/out/um.3ds usum && node test/liga.test.js test/out && node test/shop.test.js && node test/cal.test.js && node test/sorteo.test.js && node test/ui.js test/out`
(la última necesita `playwright`).

## Reconstruir el paquete (opcional)
`lib/pkmn.bundle.js` contiene el simulador y los datos. Para regenerarlo:

```bash
cd tools
npm install
node build.js
# nombres en español (PokeAPI): descarga los CSV de PokeAPI y
node names.js <carpeta con pokemon_species(_names).csv, moves/move_names, abilities/ability_names, items/item_names>
```
