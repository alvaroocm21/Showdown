// IA de los entrenadores controlados por el ordenador: elige los titulares de cada jornada según el rival y el siguiente rival.
// Lógica pura (sin DOM): recibe el Dex del simulador y los sets de Pokémon.
const LigaIA = (() => {
  // Multiplicador de un ataque de tipo `atk` contra un Pokémon de tipos `def` (0, 0.25, 0.5, 1, 2 o 4).
  function typeMult(Dex, atk, def) {
    let m = 1;
    for (const d of def) {
      if (!Dex.getImmunity(atk, d)) return 0;
      const e = Dex.getEffectiveness(atk, d);
      m *= e > 0 ? 2 : e < 0 ? 0.5 : 1;
    }
    return m;
  }
  const bstOf = sp => { const b = sp.baseStats; return b.hp + b.atk + b.def + b.spa + b.spd + b.spe; };
  // Ataques con los que un Pokémon puede hacer daño: sus movimientos de daño o, si no tiene, sus tipos como si fueran ataques.
  function attacks(Dex, set) {
    const sp = Dex.species.get(set.species), out = [];
    for (const m of set.moves || []) {
      const mv = Dex.moves.get(m);
      if (mv.exists && mv.basePower > 0) out.push({ type: mv.type, bp: mv.basePower, stab: sp.types.includes(mv.type), phys: mv.category === "Physical" });
    }
    if (!out.length) for (const t of sp.types) out.push({ type: t, bp: 70, stab: true, phys: sp.baseStats.atk >= sp.baseStats.spa });
    return out;
  }
  // Cuánto le conviene a `set` enfrentarse a `rival`: ataque contra él (con STAB y estadística adecuada) y resistencia a sus ataques.
  function against(Dex, set, rival) {
    const sp = Dex.species.get(set.species), rs = Dex.species.get(rival.species);
    let off = 0;
    for (const a of attacks(Dex, set)) {
      const stat = (a.phys ? sp.baseStats.atk : sp.baseStats.spa) / 100;
      off = Math.max(off, (a.bp / 80) * (a.stab ? 1.5 : 1) * typeMult(Dex, a.type, rs.types) * stat);
    }
    let threat = 0;
    for (const a of attacks(Dex, rival)) threat = Math.max(threat, typeMult(Dex, a.type, sp.types) * (a.stab ? 1.5 : 1));
    const def = Math.min(6, 2 / Math.max(0.25, threat));
    return 0.55 * off + 0.30 * def;
  }
  // Puntuación de un Pokémon frente a los Pokémon del rival (sin rival: solo su fuerza base).
  function score(Dex, set, rivals) {
    const sp = Dex.species.get(set.species), base = 0.15 * bstOf(sp) / 100;
    if (!rivals || !rivals.length) return base * 4;
    return rivals.reduce((s, r) => s + against(Dex, set, r), 0) / rivals.length + base;
  }
  // Ordena la plantilla: devuelve los índices de `squad`, primero los n titulares (en orden de elección) y luego el banquillo.
  // opts: { n: titulares (6), rivals: sets del rival, suspended: Set de especies sancionadas, yellows: {especie: amarillas},
  //         rest: nº de Pokémon más fuertes que se guardan en el banquillo (el siguiente rival es más duro) }
  function pick(Dex, squad, opts) {
    opts = opts || {}; const n = Math.min(opts.n || 6, squad.length), sus = opts.suspended || new Set(), yel = opts.yellows || {};
    const items = squad.map((s, i) => ({ i, s, sp: Dex.species.get(s.species), sc: score(Dex, s, opts.rivals) - 0.4 * (yel[s.species] || 0) }));
    let pool = items.filter(x => !sus.has(x.s.species));
    if (pool.length < n) pool = items.slice();                              // si casi todos están sancionados, juegan igualmente
    if (opts.rest > 0) {                                                    // se guardan los más fuertes para el siguiente rival
      const saved = new Set(pool.slice().sort((a, b) => bstOf(b.sp) - bstOf(a.sp)).slice(0, opts.rest).map(x => x.i));
      if (pool.length - saved.size >= n) pool = pool.filter(x => !saved.has(x.i));
    }
    const chosen = [], types = {};
    const cand = pool.slice();
    while (chosen.length < n && cand.length) {                              // voraz, evitando equipos con el mismo tipo repetido
      let best = null, bs = -Infinity;
      for (const x of cand) { const s = x.sc - 0.3 * Math.max(0, (types[x.sp.types[0]] || 0)); if (s > bs) { bs = s; best = x; } }
      chosen.push(best); types[best.sp.types[0]] = (types[best.sp.types[0]] || 0) + 1; cand.splice(cand.indexOf(best), 1);
    }
    const chosenIdx = new Set(chosen.map(x => x.i));
    const bench = items.filter(x => !chosenIdx.has(x.i)).sort((a, b) => b.sc - a.sc);
    return [...chosen, ...bench].map(x => x.i);
  }
  return { typeMult, score, pick, bstOf };
})();
if (typeof module !== "undefined") module.exports = LigaIA;
