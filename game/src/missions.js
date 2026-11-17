// The story: Leo Costa, fresh out of the Solmar Bay lockup, takes jobs from Vera Marlowe,
// the fixer who runs the city from the back of her garage. Three missions, each with stages
// and a marker on the map; finishing one pays out and autosaves. After the third, the city
// is the player's to keep.

import { CRIME_HEAT } from './config.js';
import { dist } from './utils.js';

export const MISSIONS = [
  {
    id: 'hot-wheels',
    title: 'HOT WHEELS',
    intro: 'Vera: Leo, welcome back. First job — a gold Veloce GT is parked at the Marina Lot. Take it. Bring it to my garage. Try not to make a scene.',
    reward: 800,
    stages: [
      { type: 'goto', text: 'Get to the Marina Lot', place: 'marinaLot' },
      { type: 'steal', text: 'Steal the gold Veloce GT', place: 'marinaLot' },
      { type: 'deliver', text: 'Deliver the Veloce GT to Vera\'s Garage', place: 'garage', needsCar: true },
    ],
  },
  {
    id: 'the-pickup',
    title: 'THE PICKUP',
    intro: 'Vera: Three packages around town. Downtown, the park, the beach. Grab them all, then drop them behind the garage. The cops will notice — keep moving.',
    reward: 1500,
    stages: [
      { type: 'pickup', text: 'Pick up package 1 — Downtown', place: 'packageDowntown' },
      { type: 'pickup', text: 'Pick up package 2 — Central Park', place: 'packagePark' },
      { type: 'pickup', text: 'Pick up package 3 — The Beach', place: 'packageBeach' },
      { type: 'deliver', text: 'Deliver the packages to the Drop-off', place: 'dropoff' },
    ],
  },
  {
    id: 'the-getaway',
    title: 'THE GETAWAY',
    intro: 'Vera: They made the crew. Three stars on you, Leo. Get to the Safehouse and lay low until the heat dies. Do not get caught.',
    reward: 3000,
    stages: [
      { type: 'goto', text: 'Reach the Safehouse — lose the cops', place: 'safehouse' },
      { type: 'survive', text: 'Lay low at the Safehouse until the heat dies', place: 'safehouse' },
    ],
  },
];

export function createMissions() {
  return {
    index: 0,
    stage: 0,
    collected: 0,
    surviveTimer: 0,
    done: false,
    started: false,
  };
}

export function currentMission(missions) {
  return missions.done ? null : MISSIONS[missions.index];
}

export function currentStage(missions) {
  const mission = currentMission(missions);
  return mission ? mission.stages[missions.stage] : null;
}

/** The objective the HUD, the minimap and the world arrow all point at. */
export function currentObjective(missions, places) {
  const stage = currentStage(missions);
  if (!stage) return null;
  const place = places[stage.place];
  return { text: stage.text, x: place.x, y: place.y, label: place.label };
}

function advance(missions, ctx) {
  const mission = currentMission(missions);
  missions.stage += 1;
  if (missions.stage >= mission.stages.length) {
    ctx.player.money += mission.reward;
    ctx.messages.push(`Vera: ${mission.title} done. $${mission.reward} is yours.`);
    ctx.audio.missionComplete();
    ctx.audio.cash();
    missions.index += 1;
    missions.stage = 0;
    missions.collected = 0;
    missions.surviveTimer = 0;
    if (missions.index >= MISSIONS.length) {
      missions.done = true;
      ctx.messages.push('Vera: That\'s the whole set, Leo. Solmar Bay is yours now. King of the Bay.');
      return { missionComplete: true, storyComplete: true };
    }
    const next = MISSIONS[missions.index];
    ctx.messages.push(next.intro);
    if (next.id === 'the-getaway') {
      // The getaway starts hot: three stars the moment it begins.
      ctx.wanted.heat = 55;
      ctx.wanted.stars = 3;
      ctx.wanted.lastCrimeAt = ctx.now;
    }
    return { missionComplete: true, storyComplete: false };
  }
  return { missionComplete: false, storyComplete: false };
}

/**
 * Advance the mission state machine. ctx carries the live world: player, playerCar,
 * the Veloce GT, whether E was pressed, the wanted level, the message feed and audio.
 * Returns { missionComplete, storyComplete } when a mission (or the story) ends.
 */
export function updateMissions(missions, ctx) {
  const out = { missionComplete: false, storyComplete: false };
  const stage = currentStage(missions);
  if (!stage || !missions.started) return out;
  const place = ctx.places[stage.place];
  const player = ctx.player;
  const playerCar = ctx.playerCar;

  if (stage.type === 'goto') {
    if (dist(player.x, player.y, place.x, place.y) < 90) {
      Object.assign(out, advance(missions, ctx));
    }
  } else if (stage.type === 'steal') {
    if (playerCar && playerCar.id === 'veloce-gt') {
      ctx.addHeat(CRIME_HEAT.stealParked);
      ctx.messages.push('Vera: That\'s the one. Now bring her home — and don\'t scratch her.');
      Object.assign(out, advance(missions, ctx));
    }
  } else if (stage.type === 'pickup') {
    if (ctx.interactPressed && dist(player.x, player.y, place.x, place.y) < 80) {
      missions.collected += 1;
      ctx.addHeat(CRIME_HEAT.stealParked);
      ctx.audio.pickup();
      ctx.messages.push(`Package ${missions.collected} of 3 secured.`);
      Object.assign(out, advance(missions, ctx));
    }
  } else if (stage.type === 'deliver') {
    const atSpot = stage.needsCar
      ? playerCar && dist(playerCar.x, playerCar.y, place.x, place.y) < 110
      : dist(player.x, player.y, place.x, place.y) < 90;
    if (atSpot) {
      Object.assign(out, advance(missions, ctx));
    }
  } else if (stage.type === 'survive') {
    if (dist(player.x, player.y, place.x, place.y) < 160) {
      if (ctx.wanted.stars === 0) {
        Object.assign(out, advance(missions, ctx));
      }
    }
  }
  return out;
}

/** Start the story: the first mission's intro and its first objective. */
export function startStory(missions, ctx) {
  if (missions.started) return;
  missions.started = true;
  ctx.messages.push(MISSIONS[0].intro);
}
