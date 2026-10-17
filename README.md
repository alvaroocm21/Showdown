# Pokémon Zafiro Alfa · Duelos

Simulador de combates por turnos con estética de Zafiro Alfa / Rubí Omega.
Forma tu equipo con **cualquier Pokémon de cualquier generación** (1290 especies y formas),
con **cualquier movimiento, habilidad y objeto**, y combate contra líderes de gimnasio, el Alto Mando
y villanos de Hoenn.

## Jugar
Abre `index.html` en el navegador (necesita internet para los sprites).
O sirve la carpeta: `python -m http.server` y entra en http://localhost:8000.
Hay que mantener junta la carpeta del proyecto: `index.html` carga `lib/pkmn.bundle.js`.

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
