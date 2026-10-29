import type { Rng } from '../../rng';
import type { Move, PokeType, StageKey } from '../../types';
import type { Ctx } from '../ops';
import type { Battle, Battler, Side, StatusName, Terrain, Weather } from '../state';

/** Multiplicadores que una habilidad aplica al cálculo de daño (todos opcionales; se multiplican entre sí). */
export interface Mods {
  /** Ataque (o Ataque Esp.) con el que se calcula el daño. */
  atk?: number;
  /** Defensa (o Def. Esp.) del objetivo. */
  def?: number;
  /** Potencia base del ataque. */
  power?: number;
  /** Bonificación por mismo tipo (por defecto ×1,5). */
  stab?: number;
  /** Multiplicador del golpe crítico (por defecto ×1,5). */
  crit?: number;
  /** Daño final. */
  final?: number;
}

export interface MoveCtx {
  battle: Battle;
  user: Battler;
  /** El rival (en combates individuales siempre existe). */
  target: Battler;
  move: Move;
}

export interface DamageCtx extends MoveCtx {
  /** Multiplicador de tipos ya calculado (0, 0,25… 4). */
  effectiveness: number;
  crit: boolean;
  physical: boolean;
  /** Clima y terreno efectivos (tras Aire Cerrado / Nubosidad). */
  weather: Weather | null;
  terrain: Terrain | null;
  /** El usuario actúa después que el objetivo en este turno (Analítico). */
  movesLast: boolean;
  /** Número de golpe dentro de un ataque multigolpe (0 = primero). */
  hitIndex: number;
}

export interface SpeedCtx {
  battle: Battle;
  self: Battler;
  weather: Weather | null;
  terrain: Terrain | null;
}

export interface BlockCtx extends MoveCtx {
  effectiveness: number;
  /** Prioridad efectiva del ataque. */
  priority: number;
  /** El ataque lo usa un Pokémon con Bromista y es de estado. */
  boostedStatus: boolean;
}

/**
 * Una habilidad del juego. Todos los ganchos son opcionales: cada habilidad define solo los que necesita.
 * Los que actúan sobre el objetivo se ignoran si el atacante tiene Rompemoldes (salvo `breakable: false`).
 */
export interface AbilityDef {
  breakable?: boolean;

  // ---- Cálculo de daño ----
  /** El dueño es el atacante. */
  outgoing?(c: DamageCtx): Mods | void;
  /** El dueño es el objetivo. */
  incoming?(c: DamageCtx): Mods | void;

  // ---- Su ataque ----
  /** Cambia el tipo del ataque del dueño (y opcionalmente su potencia). */
  moveType?(c: MoveCtx): { type: PokeType; power?: number } | void;
  /** Prioridad extra del ataque del dueño. */
  priority?(c: MoveCtx): number;
  /** Orden dentro de la misma prioridad: +1 antes, -1 después. */
  bracket?(c: MoveCtx, rng: Rng): number;
  /** Multiplicador de velocidad. */
  speed?(c: SpeedCtx): number;
  /** Multiplicador de la precisión de los ataques del dueño. */
  accuracy?(c: MoveCtx): number;
  /** Multiplicador de la precisión de los ataques que recibe el dueño. */
  evasion?(c: MoveCtx): number;
  /** Nivel de crítico extra. */
  critBonus?(c: MoveCtx): number;
  /** Todos sus golpes son críticos (Despiadado). */
  forceCrit?(c: MoveCtx): boolean;
  /** Los críticos no le afectan (Armadura Batalla). */
  noCrit?: boolean;
  /** Sus ataques nunca fallan y los que recibe tampoco (Cura Mágica…). */
  noGuard?: boolean;
  /** Ignora las mejoras de estadísticas del rival. */
  ignoresStages?: boolean;
  /** Sus ataques normales y de lucha golpean a los Fantasma. */
  hitsGhost?: boolean;
  /** Ignora las habilidades del rival al atacar. */
  moldBreaker?: boolean;
  /** Los ataques multigolpe siempre dan el máximo. */
  maxHits?: boolean;
  /** Sus ataques no hacen contacto. */
  noContact?: boolean;
  /** Impide el retroceso y el daño indirecto (Cabeza Roca / Guardia Mágica). */
  noRecoil?: boolean;
  noIndirectDamage?: boolean;
  /** Multiplica las probabilidades de efectos secundarios (Dicha). */
  secondaryChance?: number;
  /** Se anula el efecto secundario de los ataques que recibe (Polvo Escudo). */
  blocksSecondary?: boolean;
  /** Quita los efectos secundarios de sus ataques y sube su potencia (Fuerza Bruta). */
  sheerForce?: boolean;

  /** Ignora la penalización de la quemadura al atacar (Agallas). */
  ignoresBurn?: boolean;
  /** El daño de la quemadura es la mitad (Ignífugo). */
  halvesBurn?: boolean;
  /** Aguanta con 1 PS un golpe mortal desde la vida completa y es inmune a los ataques de KO (Robustez). */
  sturdy?: boolean;
  /** No retrocede (Foco Interno). */
  noFlinch?: boolean;
  /** El drenaje le hace daño a quien lo usa (Viscosecreción). */
  invertsDrain?: boolean;
  /** Conserva su velocidad aunque esté paralizado (Pies Rápidos). */
  ignoresParalysisSpeed?: boolean;
  /** En vez de dañarle, el veneno lo cura (Antídoto de Veneno). */
  poisonHeal?: boolean;
  /** Se bloquea en el primer ataque que usa (Táctica Gorila). */
  choiceLock?: boolean;
  /** Efecto justo antes de usar un ataque (Líbero, Mutatipo). */
  beforeMove?(ctx: Ctx, self: Battler, move: Move): void;
  /** El clima o el terreno acaban de cambiar (Mimético, Protosíntesis…). Se llama para los dos Pokémon activos. */
  onFieldChange?(ctx: Ctx, self: Battler): void;
  /** Reacción al retroceder (Impasible). */
  onFlinched?(ctx: Ctx, self: Battler): void;
  /** Probabilidad extra de retroceso en sus ataques (Hedor). */
  flinchBonus?: number;
  /** No le afecta el daño del clima (arena) ni los ataques que lo cambian de sitio (Ventosas, Perro Guardián). */
  weatherDamageImmune?: boolean;
  anchor?: boolean;
  /** Pierde un turno de cada dos (Letargo). */
  truant?: boolean;
  /** Los ataques que le apuntan gastan un PP extra (Presión). */
  pressure?: boolean;

  // ---- Inmunidad y absorción ----
  /** ¿Este ataque no le llega? (sin efectos: lo usa también la IA). */
  immune?(c: BlockCtx): boolean;
  /** Qué pasa cuando se anula/absorbe el ataque. Por defecto, solo el aviso «No le afecta». */
  onImmune?(ctx: Ctx, user: Battler, self: Battler, move: Move): void;
  /** Rebota el ataque de estado a quien lo usó (Espejo Mágico). */
  reflectsStatus?: boolean;
  /** Anula el golpe de un ataque de daño antes de hacer daño (Disfraz, Cara de Hielo). Devuelve true si lo absorbe. */
  absorbHit?(ctx: Ctx, user: Battler, self: Battler, move: Move): boolean;
  /** No puede cambiarse por el rival (Sombra Trampa…). */
  trapsFoe?(self: Battler, foe: Battler): boolean;

  // ---- Estados y estadísticas ----
  blocksStatus?(self: Battler, status: StatusName, battle: Battle, weather: Weather | null, terrain: Terrain | null): boolean;
  blocksConfusion?: boolean;
  /** No se pueden bajar estas estadísticas por el rival. */
  blocksStatDrop?(stat: StageKey): boolean;
  /** Rebota las bajadas de estadísticas (Armadura Espejo). */
  reflectsStatDrops?: boolean;
  /** Modifica los cambios de estadística propios (Simple ×2, Contrario ×-1). */
  stageDelta?(delta: number): number;
  /** Tras una bajada de estadística provocada por el rival. */
  onStatDropped?(ctx: Ctx, self: Battler, source: Battler): void;
  /** El rival acaba de subirse una estadística (Oportunista). */
  onFoeStatRaised?(ctx: Ctx, self: Battler, foe: Battler, stat: StageKey, delta: number): void;
  /** Inmune a Intimidación (Ritmo Propio, Despiste…). Si devuelve algo, sustituye el efecto. */
  intimidateReaction?(ctx: Ctx, self: Battler, source: Battler): 'immune' | 'handled' | void;
  /** Duración del sueño (Madrugar). */
  sleepDecrement?: number;
  /** Puede envenenar a Acero y Veneno (Corrosión). */
  poisonsAnything?: boolean;

  // ---- Eventos ----
  onSwitchIn?(ctx: Ctx, self: Battler, side: Side): void;
  onSwitchOut?(ctx: Ctx, self: Battler): void;
  onEndTurn?(ctx: Ctx, self: Battler): void;
  /** El dueño acaba de recibir daño de un ataque (también si lo debilitan). */
  onDamaged?(ctx: Ctx, self: Battler, attacker: Battler, move: Move, amount: number, crit: boolean): void;
  /** El dueño acaba de hacer daño con un ataque. */
  onDealtDamage?(ctx: Ctx, self: Battler, target: Battler, move: Move, amount: number): void;
  /** El dueño acaba de debilitar a un Pokémon con un ataque. */
  onKnockOut?(ctx: Ctx, self: Battler, victim: Battler): void;
  /** El dueño se ha debilitado por un ataque (`amount` = daño del golpe final). */
  onFainted?(ctx: Ctx, self: Battler, attacker: Battler, move: Move | null, amount: number): void;
  /** Cualquier Pokémon del campo se ha debilitado (Alma Cura, Corazón de Fuego…). */
  onAnyFainted?(ctx: Ctx, self: Battler, fainted: Battler): void;
  /** El dueño acaba de ser golpeado por un ataque de contacto y puede reaccionar contra el atacante. */
  onContact?(ctx: Ctx, self: Battler, attacker: Battler, move: Move): void;
}
