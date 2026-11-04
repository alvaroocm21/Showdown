// Sorteo de equipos: reparte Pokémon al azar entre los entrenadores. Lógica pura (sin DOM).
const LigaSorteo = (() => {
  const DEFAULTS = () => ({ size: 6, level: 50, scope: "empty", mode: "random", final: true, legend: false, unique: true, gen: 9 });
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
  // Reparte equipos a n entrenadores. Dentro de un equipo no hay dos de la misma familia; si o.unique, tampoco entre entrenadores
  // (mientras haya Pokémon suficientes; si no, se repiten los menos posibles).
  function draw(env, opts, n, rand) {
    const o = { ...DEFAULTS(), ...opts }, all = shuffle(pool(env, o), rand), used = new Set(), teams = [];
    for (let t = 0; t < n; t++) {
      const team = [], fams = new Set();
      const take = (strict) => {
        for (const sp of all) {
          if (team.length >= o.size) break;
          const f = famRoot(env.Dex, sp);
          if (fams.has(f) || (strict && o.unique && used.has(f))) continue;
          fams.add(f); if (strict) used.add(f); team.push(makeSet(env, sp, o, rand));
        }
      };
      take(true); if (team.length < o.size) take(false);
      teams.push(team);
    }
    return teams;
  }
  return { DEFAULTS, pool, draw, makeSet };
})();
if (typeof module !== "undefined") module.exports = LigaSorteo;
