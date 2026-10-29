/**
 * Habilidades que no tienen sentido en este juego, con el motivo (se muestra en la interfaz).
 * Cada habilidad del juego está en `DEFS` (tiene efecto) o aquí: lo comprueba un test.
 */
const ITEMS = 'El juego no tiene objetos';
const DOUBLES = 'Solo actúa en combates dobles (aquí son individuales)';
const FORM = 'Depende de un cambio de forma propio de ese Pokémon';
const GENDER = 'Depende del sexo de los Pokémon (aquí no hay)';
const SCREENS = 'No hay pantallas, Sustituto ni Protección en el juego';

export const INAPPLICABLE: Readonly<Record<string, string>> = {
  // Objetos
  pickup: ITEMS, 'sticky-hold': ITEMS, gluttony: ITEMS, unburden: ITEMS, klutz: ITEMS, harvest: ITEMS, magician: ITEMS,
  pickpocket: ITEMS, 'cheek-pouch': ITEMS, ripen: ITEMS, 'cud-chew': ITEMS, frisk: ITEMS, unnerve: ITEMS, symbiosis: ITEMS,
  'ball-fetch': ITEMS, 'honey-gather': ITEMS,
  // Dobles y aliados
  plus: DOUBLES, minus: DOUBLES, 'friend-guard': DOUBLES, telepathy: DOUBLES, healer: DOUBLES, battery: DOUBLES, 'power-spot': DOUBLES,
  'steely-spirit': DOUBLES, 'flower-veil': DOUBLES, 'aroma-veil': DOUBLES, receiver: DOUBLES, 'power-of-alchemy': DOUBLES,
  'curious-medicine': DOUBLES, costar: DOUBLES, hospitality: DOUBLES, commander: DOUBLES, stalwart: DOUBLES, 'propeller-tail': DOUBLES,
  // Sexo
  'cute-charm': GENDER, rivalry: GENDER,
  // Formas
  forecast: FORM, multitype: FORM, 'stance-change': FORM, schooling: FORM, 'shields-down': FORM, 'battle-bond': FORM,
  'power-construct': FORM, 'zen-mode': FORM, 'rks-system': FORM, 'gulp-missile': FORM, 'hunger-switch': FORM, 'zero-to-hero': FORM,
  illusion: 'Es solo un disfraz visual: no cambia el combate',
  // Pantallas y protecciones
  'screen-cleaner': SCREENS, infiltrator: SCREENS, 'unseen-fist': SCREENS, 'piercing-drill': SCREENS,
  // Otras
  'run-away': 'Solo sirve para huir de Pokémon salvajes', illuminate: 'No tiene efecto en combate',
  'heavy-metal': 'No hay pesos ni ataques que dependan de ellos', 'light-metal': 'No hay pesos ni ataques que dependan de ellos',
  'toxic-debris': 'No hay trampas de entrada (Púas Tóxicas…)',
};

export const inapplicableReason = (slug: string): string | undefined => INAPPLICABLE[slug];
