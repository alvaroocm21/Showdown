# Pokémon Zafiro Alfa · Duelos

Simulador de combates por turnos con estética de Zafiro Alfa / Rubí Omega.
Forma tu equipo con **cualquier Pokémon de cualquier generación** (1290 especies y formas),
con **cualquier movimiento, habilidad y objeto**, y combate contra líderes de gimnasio, el Alto Mando
y villanos de Hoenn.

## Jugar
Abre `index.html` en el navegador (necesita internet para los sprites).
O sirve la carpeta: `python -m http.server` y entra en http://localhost:8000.
Hay que mantener junta la carpeta del proyecto: `index.html` carga `lib/pkmn.bundle.js`.

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
- **Pokémon:** renders 3D de Pokémon HOME (los modelos de 8.ª/9.ª gen) desde el repositorio
  [PokeAPI/sprites](https://github.com/PokeAPI/sprites), recortados y escalados según la altura de cada especie,
  con perspectiva (el tuyo más cerca), sombra y animación de respiración. Si no cargan, se usan los sprites
  animados de Showdown. El estilo Zafiro Alfa usa los sprites animados de 6.ª gen.
- **Escenarios** dibujados por código: pradera de Paldea (día o atardecer) y **estadios de gimnasio** con
  público, focos y suelo luminoso del tipo del líder.
- **Animaciones de movimientos** que dependen de cada movimiento: carga de energía, rayos continuos
  (Lanzallamas, Rayo Hielo, Hiperrayo…), esferas (Bola Sombra…), rayos del cielo, lluvia de meteoros o rocas
  (Cometa Draco, Avalancha…), ondas por el suelo y olas (Terremoto, Surf), arañazos, mordiscos, puñetazos,
  patadas con postimágenes, ondas de sonido, viento, explosiones, espirales de mejora y escudos (Protección).
  Los impactos añaden destello de pantalla, anillos, líneas de velocidad, partículas del tipo, zoom y temblor.
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

## Reconstruir el paquete (opcional)
`lib/pkmn.bundle.js` contiene el simulador y los datos. Para regenerarlo:

```bash
cd tools
npm install
node build.js
# nombres en español (PokeAPI): descarga los CSV de PokeAPI y
node names.js <carpeta con pokemon_species(_names).csv, moves/move_names, abilities/ability_names, items/item_names>
```
