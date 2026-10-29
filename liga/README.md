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
```

## Datos
`scripts/fetch-data.ts` descarga **una vez** los datos de PokéAPI (generaciones 1-3, nombres en español)
a `src/data/*.json`, que se guardan en el repositorio: el juego no necesita conexión para los datos.
Usa los CSV oficiales de PokéAPI en GitHub (mismos datos que la API, en pocos ficheros).
Los sprites son los renders 3D de Pokémon HOME que aloja PokéAPI.

## Estructura
- `src/core/` lógica pura sin DOM (RNG con semilla, datos, estadísticas, generador de equipos…).
- `src/core/battle/` motor de combate: `damage` (fórmula 5.ª gen+), `typeEffect`, `turnOrder`, `stages`, `engine` (turno → eventos), `log` (texto en español).
- `src/core/ai/` IA del rival.
- `src/ui/` estilos y pantallas. `tests/` pruebas unitarias.

## Reglas del sorteo
- Solo Pokémon en su última etapa evolutiva (sin legendarios por defecto), 6 distintos por equipo.
- 4 ataques distintos de entre TODOS los del juego, repitiendo el sorteo si el set es injugable:
  mínimo 2 ataques de daño directo y, si es posible, al menos uno de un tipo del Pokémon.
- 1 habilidad de entre todas las del juego.
- Nivel 50, IV 31, EV 0, naturaleza neutra por defecto (ajustable en `BuildConfig`).

## Combate (fase 2: 1 contra 1)
- Fórmula de daño oficial (5.ª gen+): nivel 50, STAB ×1,5, tabla de 18 tipos, crítico ×1,5, variación 85-100 %, precisión y PP.
- Orden: prioridad del ataque y luego velocidad (empate al azar). Sin PP se usa Forcejeo (retroceso de 1/4).
- El motor devuelve una lista de eventos (`BattleEvent`) por turno; la interfaz los anima y `describeEvent` los pasa a texto.
- **Pendiente (fase 3):** estados, subidas/bajadas de estadísticas, cambios de Pokémon, habilidades y los ataques de estado,
  multigolpe, retroceso/drenaje y daño fijo. De momento esos ataques se ven en el menú como «sin efecto aún» y no hacen nada.
