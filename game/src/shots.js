// The screenshot scenes behind ?shot=chase|street|mission|standoff (with &seed=N). Each
// one sets the world to a real, playable situation — a getaway chase, a downtown stroll, a
// car theft at the marina, a standoff with the police — then plays it forward a few seconds
// with a scripted driver, so the frame is what a short game really looks like and the same
// seed always gives the same frame. The renderer and the HUD draw it exactly as in play.

import { STEP } from './config.js';
import { angleDiff, angleTo, clamp } from './utils.js';
import { createCar } from './vehicles.js';
import { updateWorld } from './world.js';

function scriptedInput(overrides) {
  return {
    move: () => overrides.move || { x: 0, y: 0 },
    drive: () => overrides.drive || { throttle: 0, steer: 0 },
    sprint: () => false,
    handbrake: () => false,
    mouse: { x: 640, y: 360, down: false, clicked: false },
    takeActions: () => 0,
    takeClick: () => false,
  };
}

const SILENT_AUDIO = {
  engine() {}, siren() {}, shoot() {}, punch() {}, crash() {}, pickup() {},
  cash() {}, missionComplete() {}, busted() {}, horn() {},
};

function runSeconds(world, seconds, inputFn) {
  for (let t = 0; t < seconds; t += STEP) {
    const input = inputFn(world, t);
    updateWorld(world, input, STEP, SILENT_AUDIO, 0);
    if (world.gameOver) break;
  }
}

function placeCruiser(world, x, y, angle, speed) {
  const car = createCar(world.random, {
    x, y, angle, model: 'police', kind: 'police', driver: 'police',
  });
  car.speed = speed;
  car.siren = true;
  world.cars.push(car);
  world.wanted.cruisers.push(car);
  return car;
}

function placeOfficer(world, x, y) {
  world.wanted.officers.push({
    x, y, angle: 0, speed: 235, hp: 40, down: false,
    punchCooldown: 0, bustTimer: 0, kind: 'officer',
  });
}

/**
 * Set `world` to the named scene and return the screen to draw. Unknown names stage the
 * chase (the cover).
 */
export function stageShot(name, world) {
  const { player } = world;
  world.messages.length = 0;
  world.wanted.heat = 0;
  world.wanted.stars = 0;
  world.wanted.officers.length = 0;
  world.wanted.cruisers.length = 0;
  world.missions.index = 0;
  world.missions.stage = 0;
  world.missions.started = true;
  world.missions.done = false;
  world.missions.collected = 0;
  player.hasPistol = false;
  player.ammo = 24;
  player.health = 100;

  if (name === 'street') {
    // On foot downtown, traffic and pedestrians all around.
    player.x = 2150;
    player.y = 960;
    player.angle = 0;
    player.inCar = null;
    world.camera.x = player.x;
    world.camera.y = player.y;
    runSeconds(world, 2.5, () => scriptedInput({ move: { x: 1, y: 0 } }));
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // Mission one: the player closing in on the gold Veloce GT at the marina.
    player.x = 4460;
    player.y = 880;
    player.angle = angleTo(player.x, player.y, 4560, 800);
    player.inCar = null;
    world.camera.x = player.x;
    world.camera.y = player.y;
    // Walk toward the GT for just under a second: far enough to reach it, not past it.
    runSeconds(world, 0.7, () => scriptedInput({
      move: { x: 0.7, y: -0.7 },
    }));
    return { screen: 'play' };
  }

  if (name === 'standoff') {
    // Two stars, pistol out, two officers closing in on a downtown sidewalk.
    player.x = 2200;
    player.y = 1000;
    player.hasPistol = true;
    player.ammo = 24;
    player.inCar = null;
    world.wanted.heat = 30;
    world.wanted.stars = 2;
    world.wanted.lastCrimeAt = 0;
    placeOfficer(world, 2010, 1000);
    placeOfficer(world, 2390, 960);
    placeCruiser(world, 1900, 1010, 0, 300);
    player.angle = angleTo(player.x, player.y, 2010, 1000);
    world.camera.x = player.x;
    world.camera.y = player.y;
    runSeconds(world, 2, () => scriptedInput({}));
    return { screen: 'play' };
  }

  // 'chase' (the cover): mission three, three stars, the Veloce GT flat out down
  // Palm Avenue with two cruisers on its tail. The road ahead is clear; the cruisers
  // trail at matching speed so the chase reads instead of piling up.
  world.missions.index = 2;
  world.missions.stage = 0;
  world.wanted.heat = 55;
  world.wanted.stars = 3;
  world.wanted.lastCrimeAt = 0;
  const gt = world.cars.find((c) => c.id === 'veloce-gt');
  gt.x = 1050;
  gt.y = 1930;
  gt.angle = 0;
  gt.speed = 520;
  gt.kind = 'player';
  gt.driver = 'player';
  player.inCar = gt;
  player.x = gt.x;
  player.y = gt.y;
  placeCruiser(world, 830, 1930, 0, 520);
  placeCruiser(world, 690, 1870, 0, 520);
  placeOfficer(world, 900, 1990);
  // Keep the chase road clear: move any traffic off this stretch of street.
  for (const car of world.cars) {
    if (car.kind === 'traffic' && car.road === 'street' && car.roadAt === 1900
      && car.x > 900 && car.x < 3400) {
      car.road = 'avenue';
      car.roadAt = 2800;
      car.x = 2800 + (car.dir > 0 ? -30 : 30);
      car.y = 400 + world.random() * 1200;
      car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }
  world.camera.x = player.x;
  world.camera.y = player.y;
  runSeconds(world, 2.5, () => {
    // The player may have been knocked out of the car; keep steering the GT itself.
    const car = player.inCar || gt;
    const lookX = car.x + 220;
    const lookY = 1930;
    const steer = clamp(angleDiff(car.angle, angleTo(car.x, car.y, lookX, lookY)) * 2.5, -1, 1);
    return scriptedInput({ drive: { throttle: 1, steer } });
  });
  return { screen: 'play' };
}
