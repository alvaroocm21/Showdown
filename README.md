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

## 🏟 Liga ROM (combates en la ROM de 3DS)
Apartado para jugar una liga entre varios entrenadores **en la ROM** (Rubí Omega / Zafiro Alfa o Ultra Sol / Ultra Luna,
descifrada, con o sin mod en .zip). Aquí no hay combates: se preparan los equipos y se llevan a la ROM.
1. **Jornada**: crea tantas como quieras; una jornada nueva copia los equipos de la anterior.
2. **Entrenadores**: añade a cada participante y elige sus Pokémon de esa jornada con el mismo editor de equipos de la app
   (nivel, naturaleza, EVs/IVs, habilidad, objeto, 4 movimientos, importar en formato Showdown) o tráelos del equipo de un jugador.
3. **ROM**: elige el `.3ds` (se lee en el dispositivo, no se sube) y asigna a cada participante un entrenador del juego
   (hay un botón para sugerirlos). Los nombres se casan en inglés (o español) con los textos de la ROM, así que funciona también con mods
   que añaden Pokémon de 8.ª/9.ª gen. Lo que no existe en la ROM se omite y se avisa.
4. **Exportar**: descarga un `.zip` con `<TitleID>/romfs/...` (solo los dos archivos de entrenadores) para `load/mods/` de Azahar
   o `luma/titles/` de una 3DS; en Chrome de escritorio también puede guardar directamente en una carpeta.
   Los nombres de los entrenadores se escriben solo en los textos en español (el .zip pesa mucho menos). Las megaevoluciones se escriben como el Pokémon base con su megapiedra.

5. **Resultados y monedas:** anota quién gana cada combate (clasificación e historial cara a cara) y cada resultado da monedas
   (victoria 100, empate 50, derrota 25; configurable). Con ellas se compran retoques a los Pokémon de la jornada: habilidad al azar,
   naturaleza (elegir o al azar), ataque (elegir o al azar), objeto al azar o IVs a 31. Las habilidades, ataques y objetos al azar salen
   de entre todos los del juego, aprenda o no el Pokémon.
   Si la ROM está abierta, el azar solo elige lo que existe en ella. Lógica en `lib/ligashop.js`.

Notas: en ORAS la ROM no guarda naturaleza ni EVs de los entrenadores (USUM sí). La Liga ROM necesita elegir archivos y descargar,
algo que el WebView de la APK actual no permite: úsala en la web/PWA. Código: `lib/romcore.js` (lectura/escritura de ROM,
GARC, entrenadores), `lib/ligamap.js` (Showdown → ROM), `lib/liga.js` + `lib/liga.css` (pantalla).
Pruebas: `python3 test/make_rom.py test/out/fake.3ds oras && python3 test/make_rom.py test/out/um.3ds usum && node test/liga.test.js test/out && node test/ui.js test/out`
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
