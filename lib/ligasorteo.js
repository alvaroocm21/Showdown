// Sorteo de equipos: reparte Pokémon al azar entre los entrenadores. Lógica pura (sin DOM).
const LigaSorteo = (() => {
  const DEFAULTS = () => ({ size: 6, level: 50, scope: "empty", mode: "random", final: true, legend: false, unique: true, gen: 9, useRating: true, rating: 50 });
  const LEGEND_TAGS = ["Legendary", "Mythical", "Restricted Legendary", "Sub-Legendary"];
  const rnd = (a, r) => a[Math.floor((r || Math.random)() * a.length)];
  function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor((r || Math.random)() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const famRoot = (Dex, sp) => { let s = sp, g = 0; while (s.prevo && g++ < 4) s = Dex.species.get(s.prevo); return s.id; };
  const ok = (env, kind, o) => !env.ok || env.ok(kind, o);

  // Especies que pueden salir con estas opciones (y que existen en la ROM, si está abierta).
  function pool(env, o) {
    return env.pool.filter(s => s.gen <= (o.gen || 9)
      && (!o.final || !(s.evos && s.evos.length))
      && (o.legend || !(s.tags || []).some(t => LEGEND_TAGS.includes(t)))
      && ok(env, "species", env.Dex.species.get(s.baseSpecies || s.name)));
  }
  const attackers = (moves, env) => moves.filter(m => m.basePower > 0);
  // Pokémon con configuración al azar: habilidad, objeto, naturaleza y ataques.
  function makeSet(env, sp, o, r) {
    const base = env.defaultSet(sp.name, { level: o.level });
    base.level = o.level;
    if (o.mode === "coherent") {
      const own = [...new Set(Object.values(sp.abilities || {}))].filter(n => ok(env, "ability", env.Dex.abilities.get(n)));
      if (own.length) base.ability = rnd(own, r);
      return base;
    }
    const abs = env.abils.filter(a => ok(env, "ability", a)); if (abs.length) base.ability = rnd(abs, r).name;
    const its = env.items.filter(i => ok(env, "item", i)); if (its.length) base.item = rnd(its, r).name;
    base.nature = rnd(env.natures, r).name;
    const mv = env.moves.filter(m => ok(env, "move", m)), dmg = shuffle(attackers(mv, env), r), rest = shuffle(mv, r), pick = [];
    for (const m of dmg.slice(0, 2)) pick.push(m.name);
    for (const m of rest) { if (pick.length >= 4) break; if (!pick.includes(m.name)) pick.push(m.name); }
    base.moves = pick;
    base.teraType = rnd(env.types, r);
    return base;
  }
  const bst = sp => { const b = sp.baseStats; return b.hp + b.atk + b.def + b.spa + b.spd + b.spe; };
  const randn = r => { const u = Math.max(1e-9, (r || Math.random)()), v = (r || Math.random)(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const etiqueta = r => r >= 90 ? "Élite" : r >= 70 ? "Alto" : r >= 40 ? "Medio" : r >= 20 ? "Bajo" : "Humilde";
  // Reparte equipos a n entrenadores. Dentro de un equipo no hay dos de la misma familia; si o.unique, tampoco entre entrenadores
  // (mientras haya Pokémon suficientes; si no, se repiten los menos posibles).
  // ratings[i] (0–100, opcional) es la calidad del entrenador i: con 90 salen los Pokémon más fuertes (por suma de estadísticas base),
  // con 30 más flojos; el azar se reparte alrededor de ese puesto de la clasificación de fuerza. Sin porcentaje, todo al azar.
  function draw(env, opts, n, rand, ratings) {
    const o = { ...DEFAULTS(), ...opts }, all = shuffle(pool(env, o), rand), used = new Set(), teams = [];
    const sorted = all.slice().sort((x, y) => bst(x) - bst(y));
    for (let t = 0; t < n; t++) {
      const team = [], fams = new Set(), r = ratings && ratings[t] != null ? Math.max(0, Math.min(100, ratings[t])) : null;
      const ok1 = (sp, strict) => { const f = famRoot(env.Dex, sp); return !fams.has(f) && !(strict && o.unique && used.has(f)); };
      const add = (sp, strict) => { const f = famRoot(env.Dex, sp); fams.add(f); if (strict) used.add(f); team.push(makeSet(env, sp, o, rand)); };
      const take = strict => {
        if (r == null) { for (const sp of all) { if (team.length >= o.size) break; if (ok1(sp, strict)) add(sp, strict); } return; }
        while (team.length < o.size && sorted.length) {
          let sp = null;
          for (let k = 0; k < 40 && !sp; k++) {            // se busca cerca del puesto que marca el porcentaje
            const u = Math.max(0, Math.min(1, r / 100 + randn(rand) * 0.07)), c = sorted[Math.floor(u * (sorted.length - 1))];
            if (ok1(c, strict)) sp = c;
          }
          if (!sp) {                                          // si no, el válido más cercano a ese puesto
            const i0 = Math.floor(r / 100 * (sorted.length - 1));
            for (let d = 0; d < sorted.length && !sp; d++) for (const i of [i0 - d, i0 + d]) if (sorted[i] && ok1(sorted[i], strict)) { sp = sorted[i]; break; }
          }
          if (!sp) break;
          add(sp, strict);
        }
      };
      take(true); if (team.length < o.size) take(false);
      teams.push(team);
    }
    return teams;
  }
  return { DEFAULTS, pool, draw, makeSet, bst, etiqueta };
})();
if (typeof module !== "undefined") module.exports = LigaSorteo;
