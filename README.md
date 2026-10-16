# Pokémon Zafiro Alfa · Duelos

Simulador de combates por turnos con estética de Zafiro Alfa / Rubí Omega.
Elige tu equipo (hasta 6 Pokémon y 4 movimientos cada uno) y lucha contra
los líderes de gimnasio, los jefes de los equipos Magma/Aqua y el campeón de Hoenn.

## Jugar
Abre `index.html` en el navegador (necesita internet para los sprites).
O sirve la carpeta: `python3 -m http.server` y entra en http://localhost:8000.

- Sprites 3D animados de 6ª generación cargados desde `play.pokemonshowdown.com/sprites`.
  Si no cargan, se muestra un marcador de color por tipo y el juego sigue funcionando.
- Tabla de tipos de la 6ª gen (con Hada), STAB, críticos, precisión, prioridad,
  estados (quemadura, parálisis, veneno, sueño, congelación), mejoras de estadísticas,
  retroceso, drenaje y curación. Todos los Pokémon a nivel 50.
- El equipo y las medallas se guardan en `localStorage`.
