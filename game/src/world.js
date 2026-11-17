// The world: one state object and the update that advances it. Every system (player,
// cars, pedestrians, police, missions, pickups, particles) is stepped here in a fixed
// order, and the events the screens care about (busted, wasted, mission complete) come
// back as a small result the loop reads.

import {
  CAR, CRIME_HEAT, PED_COUNT, PLAYER, TRAFFIC_COUNT, VIEW, WORLD,
} from './config.js';
import { clamp, dist } from './utils.js';
import { collideCity, generateCity, randomRoadPoint } from './city.js';
import { createRandom } from './random.js';
import { createPlayer, punchTarget, shootTarget, updateOnFoot } from './player.js';
import { ACTION_INTERACT } from './input.js';
import {
  collideCars, createCar, spawnParkedCars, spawnTrafficCar, updatePlayerCar, updateTrafficCar,
} from './vehicles.js';
import { carHitsPeds, createPed, scarePeds, spawnPeds, updatePeds } from './pedestrians.js';
import { addHeat, createWanted, updateWanted } from './police.js';
import { createMissions, currentObjective, startStory, updateMissions } from './missions.js';
import { saveGame } from './save.js';

const PICKUP_KINDS = ['cash', 'cash', 'cash', 'cash', 'cash', 'health', 'health', 'ammo', 'ammo', 'repair'];

export function createWorld(seed) {
  const random = createRandom(seed);
  const city = generateCity(random);
  const player = createPlayer(city.places.spawn);
  const cars = spawnParkedCars(random, 40);
  // The gold Veloce GT waits in the marina lot: mission one's target.
  const veloce = createCar(random, {
    id: 'veloce-gt',
    x: city.places.marinaLot.x,
    y: city.places.marinaLot.y,
    angle: Math.PI / 2,
    model: 'sport',
    color: '#d8b13a',
    kind: 'parked',
  });
  cars.push(veloce);
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) cars.push(spawnTrafficCar(random));
  const peds = spawnPeds(random, PED_COUNT);
  const pickups = [];
  for (let i = 0; i < 16; i += 1) pickups.push(spawnPickup(random));
  return {
    random,
    seed,
    city,
    player,
    cars,
    peds,
    pickups,
    wanted: createWanted(),
    missions: createMissions(),
    particles: [],
    tracers: [],
    messages: [],
    camera: { x: player.x, y: player.y, zoom: 1, shake: 0 },
    time: 0,
    gameOver: null,
    storyComplete: false,
    pointer: { x: player.x, y: player.y },
    pickupTimer: 0,
  };
}

function spawnPickup(random) {
  const point = randomRoadPoint(random);
  const kind = PICKUP_KINDS[Math.floor(random() * PICKUP_KINDS.length)];
  return {
    x: point.x + (random() - 0.5) * 120,
    y: point.y + (random() - 0.5) * 120,
    kind,
    amount: kind === 'cash' ? 25 + Math.floor(random() * 4) * 25 : 0,
    bob: random() * Math.PI * 2,
  };
}

function addParticles(world, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = world.random() * Math.PI * 2;
    const s = speed * (0.4 + world.random() * 0.6);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.4 + world.random() * 0.4,
      maxLife: 0.8,
      color,
      size: 2 + world.random() * 3,
    });
  }
}

function nearestCar(world, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.cars) {
    if (car.kind === 'wrecked') continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(world, car) {
  const { player } = world;
  if (car.kind === 'traffic') {
    // Pull the driver out: they flee, and the theft is a crime.
    const driver = createPed(world.random);
    driver.x = car.x + 50;
    driver.y = car.y + 50;
    driver.state = 'flee';
    driver.fleeTimer = 3;
    driver.fleeX = car.x;
    driver.fleeY = car.y;
    world.peds.push(driver);
    addHeat(world.wanted, CRIME_HEAT.stealOccupied, world.time);
    world.messages.push('You jacked a car — the driver ran for it.');
  }
  car.kind = 'player';
  car.driver = 'player';
  player.inCar = car;
}

function exitCar(world) {
  const { player } = world;
  const car = player.inCar;
  if (!car) return;
  const side = car.angle + Math.PI / 2;
  player.x = car.x + Math.cos(side) * 44;
  player.y = car.y + Math.sin(side) * 44;
  const body = { x: player.x, y: player.y, r: PLAYER.radius };
  collideCity(body, world.city);
  player.x = body.x;
  player.y = body.y;
  player.inCar = null;
  car.kind = 'parked';
  car.driver = null;
  car.speed = 0;
}

function respawn(world, place, reason) {
  const { player } = world;
  if (player.inCar) {
    player.inCar.kind = 'parked';
    player.inCar.driver = null;
    player.inCar = null;
  }
  player.x = place.x;
  player.y = place.y;
  player.health = PLAYER.health;
  player.ammo = Math.max(player.ammo, 12);
  world.wanted.heat = 0;
  world.wanted.stars = 0;
  world.wanted.officers.length = 0;
  world.wanted.cruisers.length = 0;
  world.camera.x = player.x;
  world.camera.y = player.y;
  world.gameOver = reason;
}

/** One fixed step. Returns { busted, wasted, missionComplete, storyComplete }. */
export function updateWorld(world, input, dt, audio, actions) {
  const out = { busted: false, wasted: false, missionComplete: false, storyComplete: false };
  const { player } = world;
  world.time += dt;

  // --- Player: drive, walk, fight, enter and leave cars.
  const playerCar = player.inCar;
  if (playerCar) {
    const drive = input.drive();
    updatePlayerCar(playerCar, drive, input.handbrake(), dt, world.city);
    audio.engine(Math.abs(playerCar.speed) / playerCar.maxSpeed, true);
    if (actions & ACTION_INTERACT) exitCar(world);
    // A wrecked ride throws the player out.
    if (playerCar.hp <= 0) {
      playerCar.kind = 'wrecked';
      addParticles(world, playerCar.x, playerCar.y, '#3a3a3a', 24, 160);
      audio.crash();
      exitCar(world);
    }
  } else {
    updateOnFoot(player, input.move(), input.sprint(), dt, world.city);
    audio.engine(0, false);
    if (actions & ACTION_INTERACT) {
      const car = nearestCar(world, player.x, player.y, 74);
      if (car) enterCar(world, car);
    }
    if (actions.punch) {
      const targets = [...world.peds, ...world.wanted.officers];
      const hit = punchTarget(player, targets);
      if (hit) {
        audio.punch();
        addParticles(world, hit.x, hit.y, '#e8d44d', 6, 90);
        hit.hp -= PLAYER.punchDamage;
        if (hit.kind === 'officer') {
          addHeat(world.wanted, CRIME_HEAT.punchPed, world.time);
          if (hit.hp <= 0) {
            hit.down = true;
            addHeat(world.wanted, CRIME_HEAT.killCop, world.time);
            world.messages.push('You dropped a cop. The whole force is coming.');
          }
        } else {
          scarePeds(world.peds, player.x, player.y, 260);
          addHeat(world.wanted, CRIME_HEAT.punchPed, world.time);
          if (hit.hp <= 0) {
            hit.state = 'down';
            hit.downTimer = 3.5;
            addHeat(world.wanted, CRIME_HEAT.killPed, world.time);
          }
        }
      } else {
        audio.punch();
      }
    }
    if (input.mouse.down && player.hasPistol) {
      const targets = [...world.peds, ...world.wanted.officers];
      const hit = shootTarget(player, world.pointer.x, world.pointer.y, targets);
      world.tracers.push({
        x1: player.x, y1: player.y,
        x2: player.x + Math.cos(player.angle) * 300,
        y2: player.y + Math.sin(player.angle) * 300,
        life: 0.09,
      });
      if (player.ammo >= 0) {
        audio.shoot();
        addHeat(world.wanted, CRIME_HEAT.shoot, world.time);
        scarePeds(world.peds, player.x, player.y, 420);
        if (hit) {
          addParticles(world, hit.x, hit.y, '#e5534b', 8, 110);
          hit.hp -= PLAYER.shootDamage;
          if (hit.kind === 'officer') {
            if (hit.hp <= 0) {
              hit.down = true;
              addHeat(world.wanted, CRIME_HEAT.killCop, world.time);
              world.messages.push('You dropped a cop. The whole force is coming.');
            }
          } else if (hit.hp <= 0) {
            hit.state = 'down';
            hit.downTimer = 3.5;
            addHeat(world.wanted, CRIME_HEAT.killPed, world.time);
          }
        }
      }
    }
  }

  // --- Traffic and the police.
  for (const car of world.cars) {
    if (car.kind === 'traffic') updateTrafficCar(car, world.cars, dt, world.random);
  }
  // Keep the streets full.
  const trafficCount = world.cars.filter((c) => c.kind === 'traffic').length;
  if (trafficCount < TRAFFIC_COUNT) world.cars.push(spawnTrafficCar(world.random));
  collideCars(world.cars);
  updatePeds(world.peds, player, world.cars, dt, world.random, world.city);

  // Cars running people over.
  for (const car of world.cars) {
    if (car.kind === 'parked' || car.kind === 'wrecked') continue;
    const hit = carHitsPeds(car, world.peds);
    for (const ped of hit) {
      addParticles(world, ped.x, ped.y, '#e5534b', 8, 120);
      if (car.kind === 'player') {
        addHeat(world.wanted, CRIME_HEAT.hitPedWithCar, world.time);
        world.messages.push('You ran someone over. Witnesses called it in.');
      }
    }
    // A fast car clipping the player on foot hurts — once per hit, not per frame.
    if (player.hurtCooldown <= 0 && !player.inCar && Math.abs(car.speed) > 150
      && dist(car.x, car.y, player.x, player.y) < 32) {
      player.health -= 15;
      player.hurtCooldown = 0.8;
      addParticles(world, player.x, player.y, '#e5534b', 8, 120);
      audio.crash();
      player.x += (player.x - car.x) * 0.4;
      player.y += (player.y - car.y) * 0.4;
    }
  }
  if (player.hurtCooldown > 0) player.hurtCooldown -= dt;

  // Police: chase, punch, ram, bust.
  const policeEvents = updateWanted(world.wanted, player, player.inCar, dt, world.time, world.random, world.city, world.cars);
  if (policeEvents.rammed && player.inCar) {
    player.inCar.hp -= 9;
    player.health -= 4;
    world.camera.shake = 7;
    audio.crash();
    addParticles(world, player.inCar.x, player.inCar.y, '#e8d44d', 10, 130);
  }
  if (policeEvents.busted) {
    const lost = Math.min(player.money, 200);
    player.money -= lost;
    world.messages.push(`BUSTED. The cops took $${lost} and your afternoon.`);
    audio.busted();
    respawn(world, world.city.places.policeStation, 'busted');
    out.busted = true;
    out.lost = lost;
    return out;
  }

  // --- Pickups.
  for (const pickup of world.pickups) {
    pickup.bob += dt * 3;
    const d = dist(player.x, player.y, pickup.x, pickup.y);
    const carD = player.inCar ? dist(player.inCar.x, player.inCar.y, pickup.x, pickup.y) : Infinity;
    if (d < 34 || carD < 40) {
      if (pickup.kind === 'cash') {
        player.money += pickup.amount;
        world.messages.push(`+$${pickup.amount} found on the street.`);
        audio.cash();
      } else if (pickup.kind === 'health') {
        player.health = Math.min(PLAYER.health, player.health + 40);
        audio.pickup();
      } else if (pickup.kind === 'ammo') {
        player.ammo = Math.min(PLAYER.maxAmmo, player.ammo + 24);
        player.hasPistol = true;
        audio.pickup();
        world.messages.push('Pistol ammo. You are armed now.');
      } else if (pickup.kind === 'repair' && player.inCar) {
        player.inCar.hp = Math.min(CAR.health, player.inCar.hp + 50);
        audio.pickup();
      }
      pickup.taken = true;
    }
  }
  world.pickups = world.pickups.filter((p) => !p.taken);
  world.pickupTimer += dt;
  if (world.pickupTimer > 6 && world.pickups.length < 16) {
    world.pickupTimer = 0;
    world.pickups.push(spawnPickup(world.random));
  }

  // --- Missions.
  const missionOut = updateMissions(world.missions, {
    player,
    playerCar: player.inCar,
    places: world.city.places,
    wanted: world.wanted,
    messages: world.messages,
    audio,
    now: world.time,
    interactPressed: (actions & ACTION_INTERACT) !== 0,
    addHeat: (amount) => addHeat(world.wanted, amount, world.time),
  });
  if (missionOut.missionComplete) {
    out.missionComplete = true;
    saveGame(world);
  }
  if (missionOut.storyComplete) {
    world.storyComplete = true;
    out.storyComplete = true;
  }

  // --- Wasted: health gone with no police on the case is an accident, not an arrest.
  if (player.health <= 0) {
    const lost = Math.min(player.money, 100);
    player.money -= lost;
    world.messages.push(`WASTED. The hospital patched you up for $${lost}.`);
    audio.busted();
    respawn(world, world.city.places.hospital, 'wasted');
    out.wasted = true;
    out.lost = lost;
    return out;
  }

  // --- Particles, tracers, camera.
  for (const p of world.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
  }
  world.particles = world.particles.filter((p) => p.life > 0);
  for (const t of world.tracers) t.life -= dt;
  world.tracers = world.tracers.filter((t) => t.life > 0);
  const focus = player.inCar || player;
  const targetZoom = player.inCar ? 0.82 : 1;
  world.camera.x += (focus.x - world.camera.x) * Math.min(1, dt * 5);
  world.camera.y += (focus.y - world.camera.y) * Math.min(1, dt * 5);
  world.camera.zoom += (targetZoom - world.camera.zoom) * Math.min(1, dt * 2);
  // Never show the void past the world's edge.
  const halfW = VIEW.width / 2 / world.camera.zoom;
  const halfH = VIEW.height / 2 / world.camera.zoom;
  world.camera.x = clamp(world.camera.x, halfW, WORLD.width - halfW);
  world.camera.y = clamp(world.camera.y, halfH, WORLD.height - halfH);
  world.camera.shake = Math.max(0, world.camera.shake - dt * 22);
  // The siren wails while a cruiser is near.
  const sirenNear = world.wanted.cruisers.some((c) => dist(c.x, c.y, player.x, player.y) < 900);
  audio.siren(sirenNear, dt);

  return out;
}

export { currentObjective };
