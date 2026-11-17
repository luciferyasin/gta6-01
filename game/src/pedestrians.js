// Pedestrians: the people of Solmar Bay. They stroll the sidewalks, cross at corners,
// run from gunfire and fast cars, and go down when a car hits them or a fist lands hard
// enough. A pedestrian who goes down stays down a while, then gets up and runs.

import { PALETTE, ROAD_WIDTH } from './config.js';
import { angleTo, dist, pick } from './utils.js';
import { collideCity, randomRoadPoint } from './city.js';

const SIDEWALK_OFF = ROAD_WIDTH / 2 + 26;

export function createPed(random) {
  const point = randomRoadPoint(random);
  let x;
  let y;
  let angle;
  if (point.road === 'avenue') {
    x = point.roadX + (random() < 0.5 ? -SIDEWALK_OFF : SIDEWALK_OFF);
    y = point.y;
    angle = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    x = point.x;
    y = point.roadY + (random() < 0.5 ? -SIDEWALK_OFF : SIDEWALK_OFF);
    angle = random() < 0.5 ? 0 : Math.PI;
  }
  return {
    x, y, angle,
    speed: 42 + random() * 30,
    hp: 30,
    shirt: pick(random, PALETTE.pedShirt),
    state: 'walk',
    downTimer: 0,
    fleeTimer: 0,
    fleeX: 0,
    fleeY: 0,
    road: point.road,
    roadAt: point.road === 'avenue' ? point.roadX : point.roadY,
    dir: point.dir,
  };
}

export function spawnPeds(random, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) peds.push(createPed(random));
  return peds;
}

/** A threat (a shot, a punch, a speeding car) sends nearby pedestrians running. */
export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.fleeTimer = 2.2;
      ped.fleeX = x;
      ped.fleeY = y;
    }
  }
}

export function updatePeds(peds, player, cars, dt, random, city) {
  for (const ped of peds) {
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'flee';
        ped.fleeTimer = 2.5;
        ped.fleeX = player.x;
        ped.fleeY = player.y;
        ped.hp = 30;
      }
      continue;
    }
    // A fast car bearing down scares a pedestrian off the road.
    for (const car of cars) {
      if (car.kind === 'parked' || Math.abs(car.speed) < 140) continue;
      if (dist(ped.x, ped.y, car.x, car.y) < 110) {
        ped.state = 'flee';
        ped.fleeTimer = 1.6;
        ped.fleeX = car.x;
        ped.fleeY = car.y;
        break;
      }
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const away = angleTo(ped.fleeX, ped.fleeY, ped.x, ped.y);
      ped.angle = away;
      ped.x += Math.cos(away) * 185 * dt;
      ped.y += Math.sin(away) * 185 * dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    } else {
      // Stroll the sidewalk; at a crossing, sometimes turn onto the other road.
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      if (Math.abs(ped.x - ped.roadAt) > 700 && ped.road === 'avenue') {
        ped.road = 'street';
        ped.roadAt = ped.y;
        ped.angle = random() < 0.5 ? 0 : Math.PI;
      } else if (Math.abs(ped.y - ped.roadAt) > 700 && ped.road === 'street') {
        ped.road = 'avenue';
        ped.roadAt = ped.x;
        ped.angle = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    const body = { x: ped.x, y: ped.y, r: 11 };
    collideCity(body, city);
    ped.x = body.x;
    ped.y = body.y;
    // Wander back into the city if pushed out.
    if (ped.x < 40 || ped.x > 4760 || ped.y < 40 || ped.y > 3560) {
      const fresh = createPed(random);
      Object.assign(ped, fresh);
    }
  }
}

/** A pedestrian hit by a car at speed goes down. Returns the ones knocked down. */
export function carHitsPeds(car, peds) {
  const hit = [];
  if (Math.abs(car.speed) < 90) return hit;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (dist(car.x, car.y, ped.x, ped.y) < 34) {
      ped.state = 'down';
      ped.downTimer = 3.5;
      ped.hp = 0;
      hit.push(ped);
    }
  }
  return hit;
}
