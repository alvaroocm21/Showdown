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
- `src/core/game/` perfiles, calendario, clasificación, temporadas y operaciones sobre la partida (todo puro y con tests).
- `src/storage/` guardado en `localStorage`, validación, versionado y exportar/importar JSON.
- `src/ui/` estilos y pantallas. `tests/` pruebas unitarias.

## Reglas del sorteo
- Solo Pokémon en su última etapa evolutiva (sin legendarios por defecto), 6 distintos por equipo.
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
- **Ataques implementados (263 de 353, el 74,5 %):** daño directo, multigolpe, drenaje, retroceso, ataques de dos turnos
  (Rayo Solar…), recarga (Hiperrayo…), Sorpresa, Explosión, daño fijo, KO de un golpe, potencia variable (Retorno, Magnitud, Plumas),
  estados, mejoras, curación y Descanso, además de efectos secundarios (estado, retroceso, bajadas/subidas de estadísticas).
- **Sin efecto aún** (se muestran en el menú como «sin efecto aún» y no hacen nada): clima, pantallas, Protección, Sustituto,
  confusión, Dulce Aroma/Drenadoras, Contraataque/Venganza, Foco Energía, Metrónomo, Transformación, ataques de salida forzada…
  Los ataques de dos turnos no tienen invulnerabilidad (Vuelo/Excavar solo hacen la preparación y el golpe).
- **Habilidades implementadas (54 de 76):** Intimidación, Levitación, Mar Llamas, Torrente, Espesura, Enjambre, Robustez,
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
