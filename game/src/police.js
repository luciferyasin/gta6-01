// The wanted system: heat, stars, and the police who answer them. Heat rises with crime
// and falls when the player lies low; the stars decide how many officers and cruisers hunt
// the player. An officer who corners the player on foot busts them; a cruiser rams their car.

import { CRIME_HEAT, POLICE_FORCE, WANTED_BANDS, WANTED_DECAY } from './config.js';
import { angleTo, dist } from './utils.js';
import { randomRoadPoint } from './city.js';
import { createCar, updatePoliceCar } from './vehicles.js';

export function createWanted() {
  return {
    heat: 0,
    stars: 0,
    lastCrimeAt: -100,
    officers: [],
    cruisers: [],
  };
}

export function starsFromHeat(heat) {
  let stars = 0;
  for (let i = 0; i < WANTED_BANDS.length; i += 1) {
    if (heat >= WANTED_BANDS[i]) stars = i;
  }
  return stars;
}

export function addHeat(wanted, amount, now) {
  wanted.heat = Math.min(100, wanted.heat + amount);
  wanted.lastCrimeAt = now;
  wanted.stars = starsFromHeat(wanted.heat);
}

function spawnOfficer(random, player) {
  const point = randomRoadPoint(random);
  // Put the officer on a road a few hundred pixels from the player.
  let x = point.x;
  let y = point.y;
  const d = dist(x, y, player.x, player.y);
  if (d < 350 || d > 1000) {
    x = player.x + (random() < 0.5 ? -1 : 1) * (450 + random() * 250);
    y = player.y + (random() < 0.5 ? -1 : 1) * (450 + random() * 250);
  }
  return {
    x, y, angle: 0, speed: 235, hp: 40, down: false,
    punchCooldown: 0, bustTimer: 0, kind: 'officer',
  };
}

function spawnCruiser(random, player) {
  const point = randomRoadPoint(random);
  const car = createCar(random, {
    x: point.x, y: point.y, angle: point.angle,
    model: 'police', kind: 'police', driver: 'police',
    road: point.road, roadAt: point.road === 'avenue' ? point.roadX : point.roadY, dir: point.dir,
  });
  car.speed = 300;
  car.siren = true;
  car.ramCooldown = 0;
  return car;
}

/**
 * Advance the wanted level and every officer and cruiser. Returns events:
 * { busted } when an officer corners the player, { rammed } when a cruiser hits the car.
 */
export function updateWanted(wanted, player, playerCar, dt, now, random, city, cars) {
  const events = { busted: false, rammed: false };
  // Heat decays only once the player has been quiet and unseen for a while.
  const nearestPolice = nearestPoliceDist(wanted, player);
  if (now - wanted.lastCrimeAt > 5 && nearestPolice > 600) {
    wanted.heat = Math.max(0, wanted.heat - WANTED_DECAY * dt);
    wanted.stars = starsFromHeat(wanted.heat);
  }
  const [wantOfficers, wantCruisers] = POLICE_FORCE[wanted.stars];

  // Spawn up to the force for this wanted level. Cruisers are cars, so they join the
  // world's car list as well — that is what draws them and lets them collide.
  if (wanted.officers.length < wantOfficers) {
    wanted.officers.push(spawnOfficer(random, player));
  }
  if (wanted.cruisers.length < wantCruisers) {
    const cruiser = spawnCruiser(random, player);
    wanted.cruisers.push(cruiser);
    cars.push(cruiser);
  }
  // When the heat is gone, the police stand down: pull their cruisers out of the
  // world's car list too, or they would sit frozen on the road.
  if (wanted.stars === 0) {
    for (const cruiser of wanted.cruisers) {
      const i = cars.indexOf(cruiser);
      if (i >= 0) cars.splice(i, 1);
    }
    wanted.officers.length = 0;
    wanted.cruisers.length = 0;
    return events;
  }

  const target = playerCar || player;
  for (const officer of wanted.officers) {
    if (officer.down) continue;
    const d = dist(officer.x, officer.y, player.x, player.y);
    if (playerCar) {
      // On foot no more: run at the car and beat on it.
      const cd = dist(officer.x, officer.y, playerCar.x, playerCar.y);
      officer.angle = angleTo(officer.x, officer.y, playerCar.x, playerCar.y);
      if (cd > 46) {
        officer.x += Math.cos(officer.angle) * officer.speed * dt;
        officer.y += Math.sin(officer.angle) * officer.speed * dt;
      } else if (officer.punchCooldown <= 0) {
        officer.punchCooldown = 0.9;
        playerCar.hp -= 5;
      }
      officer.bustTimer = 0;
    } else {
      officer.angle = angleTo(officer.x, officer.y, player.x, player.y);
      if (d > 30) {
        officer.x += Math.cos(officer.angle) * officer.speed * dt;
        officer.y += Math.sin(officer.angle) * officer.speed * dt;
        officer.bustTimer = Math.max(0, officer.bustTimer - dt * 2);
      } else {
        // Cornered: the bust timer runs while the officer holds the player.
        officer.bustTimer += dt;
        if (officer.punchCooldown <= 0) {
          officer.punchCooldown = 0.9;
          player.health -= 8;
        }
        if (officer.bustTimer > 1.5) events.busted = true;
      }
    }
    if (officer.punchCooldown > 0) officer.punchCooldown -= dt;
    // Officers too far away give up and walk off.
    if (d > 1500) officer.down = true;
  }
  wanted.officers = wanted.officers.filter((o) => !o.down);

  for (const cruiser of wanted.cruisers) {
    updatePoliceCar(cruiser, target, dt);
    if (cruiser.ramCooldown > 0) cruiser.ramCooldown -= dt;
    // A cruiser that catches an on-foot player lets an officer out.
    if (!playerCar && dist(cruiser.x, cruiser.y, player.x, player.y) < 130
      && wanted.officers.length < wantOfficers) {
      const officer = spawnOfficer(random, player);
      officer.x = cruiser.x + 40;
      officer.y = cruiser.y + 40;
      wanted.officers.push(officer);
    }
    // Ramming the player's car: one hit per cooldown, not one per frame.
    if (playerCar && cruiser.ramCooldown <= 0
      && dist(cruiser.x, cruiser.y, playerCar.x, playerCar.y) < 52
      && Math.abs(cruiser.speed) > 150) {
      events.rammed = true;
      cruiser.ramCooldown = 0.8;
      cruiser.speed *= 0.5;
    }
  }
  return events;
}

function nearestPoliceDist(wanted, player) {
  let best = Infinity;
  for (const o of wanted.officers) best = Math.min(best, dist(o.x, o.y, player.x, player.y));
  for (const c of wanted.cruisers) best = Math.min(best, dist(c.x, c.y, player.x, player.y));
  return best;
}

export { CRIME_HEAT };
