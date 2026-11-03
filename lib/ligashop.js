// Monedas y tienda de la Liga ROM: lógica pura (sin DOM) para retocar los Pokémon de un entrenador.
const LigaShop = (() => {
  const DEFAULTS = () => ({ win: 100, draw: 50, loss: 25, prices: { ab: 100, abAny: 250, natR: 50, nat: 150, mvR: 60, mv: 120, itR: 80, iv: 200 } });
  const LABELS = { ab: "Habilidad al azar (de su especie)", abAny: "Habilidad al azar (cualquiera)", natR: "Naturaleza al azar", nat: "Elegir naturaleza", mvR: "Ataque al azar", mv: "Elegir ataque", itR: "Objeto al azar", iv: "IVs a 31" };
  const pick = (a, rand) => a.length ? a[Math.floor((rand || Math.random)() * a.length)] : null;
  const ok = (env, kind, o) => !env.ok || env.ok(kind, o);

  function abilityPool(set, env, any) {
    const sp = env.Dex.species.get(set.species);
    const names = any ? env.abils.map(a => a.name) : Object.values(sp.abilities || {});
    return [...new Set(names)].filter(n => n !== set.ability && ok(env, "ability", env.Dex.abilities.get(n)));
  }
  const naturePool = (set, env) => env.natures.map(n => n.name).filter(n => n !== set.nature);
  function movePool(set, env) {
    const learn = env.learnable(env.Dex.species.get(set.species)), known = (set.moves || []);
    return env.moves.filter(m => learn.has(m.id) && !known.includes(m.name) && ok(env, "move", m)).map(m => m.name);
  }
  const itemPool = (set, env) => env.items.filter(i => i.name !== set.item && ok(env, "item", i)).map(i => i.name);
  const ivsPerfect = set => KEYS.every(k => (set.ivs && set.ivs[k]) === 31);
  const KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

  // ¿Se puede comprar esta mejora ahora mismo? Devuelve un texto con el motivo si no.
  function why(kind, set, env) {
    if (kind === "ab" && !abilityPool(set, env, false).length) return "No tiene otra habilidad";
    if (kind === "abAny" && !abilityPool(set, env, true).length) return "Sin habilidades disponibles";
    if (kind === "mvR" && !movePool(set, env).length) return "Sin ataques nuevos que aprenda";
    if (kind === "itR" && !itemPool(set, env).length) return "Sin objetos";
    if (kind === "iv" && ivsPerfect(set)) return "Ya tiene todos los IVs a 31";
    return "";
  }

  // Aplica la mejora sobre el Pokémon (lo modifica) y devuelve el texto del cambio, o null si no se pudo.
  // arg: valor elegido para "nat" ({nature}) y "mv" ({move, slot}).
  function apply(kind, set, env, arg, rand) {
    const text = (x, a, b) => `${x}: ${a} → ${b}`;
    if (kind === "ab" || kind === "abAny") {
      const n = pick(abilityPool(set, env, kind === "abAny"), rand); if (!n) return null;
      const old = set.ability; set.ability = n; return text("Habilidad", old || "—", n);
    }
    if (kind === "natR" || kind === "nat") {
      const n = kind === "nat" ? arg.nature : pick(naturePool(set, env), rand); if (!n) return null;
      const old = set.nature; set.nature = n; return text("Naturaleza", old || "—", n);
    }
    if (kind === "mvR" || kind === "mv") {
      set.moves = (set.moves || []).slice();
      const mv = kind === "mv" ? arg.move : pick(movePool(set, env), rand); if (!mv) return null;
      let slot = kind === "mv" ? arg.slot : (set.moves.length < 4 ? set.moves.length : Math.floor((rand || Math.random)() * 4));
      if (slot > set.moves.length) slot = set.moves.length;
      const old = set.moves[slot]; set.moves[slot] = mv;
      set.moves = set.moves.filter((m, i) => m !== mv || i === slot);
      return text("Ataque", old || "(hueco libre)", mv);
    }
    if (kind === "itR") {
      const n = pick(itemPool(set, env), rand); if (!n) return null;
      const old = set.item; set.item = n; return text("Objeto", old || "ninguno", n);
    }
    if (kind === "iv") {
      if (ivsPerfect(set)) return null;
      set.ivs = { ...(set.ivs || {}), ...Object.fromEntries(KEYS.map(k => [k, 31])) }; return "IVs: todos a 31";
    }
    return null;
  }
  return { DEFAULTS, LABELS, why, apply, abilityPool, movePool, itemPool, naturePool };
})();
if (typeof module !== "undefined") module.exports = LigaShop;
