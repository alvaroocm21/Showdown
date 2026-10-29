import './ui/styles.css';
import { rollPokemon, rollTeam } from './core/generator';
import { createRng, randomSeed } from './core/rng';
import type { PokemonSet } from './core/types';
import { mountBattle } from './ui/screens/battle';
import { mountTeam } from './ui/screens/team';

const app = document.getElementById('app')!;

let seed = Number(location.hash.slice(1)) || randomSeed();
let team: PokemonSet[] = rollTeam(createRng(seed));

function showTeam(): void {
  mountTeam(app, {
    team,
    seed,
    onRollTeam: () => {
      seed = randomSeed();
      history.replaceState(null, '', `#${seed}`);
      team = rollTeam(createRng(seed));
      showTeam();
    },
    onReroll: (i) => {
      const others = new Set(team.filter((_, j) => j !== i).map((p) => p.speciesId));
      team[i] = rollPokemon(createRng(randomSeed()), others);
      showTeam();
    },
    onFight: showBattle,
  });
  window.scrollTo(0, 0);
}

function showBattle(): void {
  mountBattle(app, { team, onExit: showTeam, onRematch: showBattle });
  window.scrollTo(0, 0);
}

showTeam();
