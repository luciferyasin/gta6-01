// Cars: the player's ride, the traffic that fills the roads, parked cars to steal and the
// police cruisers that chase. Driving is arcade physics (throttle, steering that bites with
// speed, grip and drag); traffic follows the road grid in the right-hand lane and turns at
// intersections; police cars hunt the player.

import { AVENUES, CAR, PALETTE, STREETS, WORLD } from './config.js';
import { angleDiff, angleTo, clamp, dist, pick } from './utils.js';
import { collideCity, isOnRoad, nearestRoad, randomRoadPoint } from './city.js';

export const MODELS = {
  sedan: { length: 62, width: 30, maxSpeed: 520, accel: 380, color: '#c8ccd2' },
  taxi: { length: 62, width: 30, maxSpeed: 540, accel: 400, color: PALETTE.taxi },
  sport: { length: 66, width: 30, maxSpeed: 680, accel: 520, color: PALETTE.sport },
  van: { length: 74, width: 32, maxSpeed: 440, accel: 300, color: '#7a8a99' },
  truck: { length: 88, width: 34, maxSpeed: 400, accel: 260, color: '#8a6f4a' },
  police: { length: 64, width: 30, maxSpeed: 640, accel: 500, color: PALETTE.policeCar },
};

const TRAFFIC_MODELS = ['sedan', 'sedan', 'taxi', 'sedan', 'van', 'sedan', 'truck', 'taxi'];
const TRAFFIC_COLORS = ['#c8ccd2', '#3f6fb5', '#b53f3f', '#4a9e6a', '#d8d8d8', '#2f2f38', '#c86a3f'];

export function createCar(random, opts) {
  const model = MODELS[opts.model] || MODELS.sedan;
  return {
    id: opts.id || Math.floor(random() * 1e9).toString(36),
    x: opts.x,
    y: opts.y,
    angle: opts.angle || 0,
    speed: 0,
    model: opts.model || 'sedan',
    color: opts.color || model.color,
    length: model.length,
    width: model.width,
    maxSpeed: model.maxSpeed,
    accel: model.accel,
    hp: CAR.health,
    kind: opts.kind || 'traffic',
    driver: opts.driver || null,
    // Traffic state: which road it follows and which way.
    road: opts.road || null,
    roadAt: opts.roadAt || 0,
    dir: opts.dir || 1,
    cruise: 150 + random() * 80,
    stuck: 0,
    siren: false,
    ramCooldown: 0,
  };
}

/** Parked cars along road edges, plus the mission cars the world places itself. */
export function spawnParkedCars(random, count) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const point = randomRoadPoint(random);
    const side = random() < 0.5 ? -1 : 1;
    let x;
    let y;
    let angle;
    if (point.road === 'avenue') {
      x = point.roadX + side * 88;
      y = clamp(point.y, 140, WORLD.height - 140);
      angle = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      x = clamp(point.x, 140, WORLD.width - 140);
      y = point.roadY + side * 88;
      angle = side > 0 ? 0 : Math.PI;
    }
    cars.push(createCar(random, {
      x, y, angle,
      model: pick(random, TRAFFIC_MODELS),
      color: pick(random, TRAFFIC_COLORS),
      kind: 'parked',
    }));
  }
  return cars;
}

/** A traffic car already on a road, driving in its lane. */
export function spawnTrafficCar(random) {
  const point = randomRoadPoint(random);
  const car = createCar(random, {
    x: point.x,
    y: point.y,
    angle: point.angle,
    model: pick(random, TRAFFIC_MODELS),
    color: pick(random, TRAFFIC_COLORS),
    kind: 'traffic',
    road: point.road,
    roadAt: point.road === 'avenue' ? point.roadX : point.roadY,
    dir: point.dir,
  });
  car.speed = car.cruise;
  return car;
}

/** The front and back axle points, used for building collision. */
function axlePoints(car) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const half = car.length * 0.32;
  return {
    fx: car.x + c * half, fy: car.y + s * half,
    bx: car.x - c * half, by: car.y - s * half,
  };
}

function collideCarWithCity(car, city) {
  const { fx, fy, bx, by } = axlePoints(car);
  const front = { x: fx, y: fy, r: CAR.radius };
  const back = { x: bx, y: by, r: CAR.radius };
  const hitF = collideCity(front, city);
  const hitB = collideCity(back, city);
  if (hitF || hitB) {
    // Pull the car back to its axles' corrected positions and kill its speed.
    car.x = (front.x + back.x) / 2;
    car.y = (front.y + back.y) / 2;
    car.speed *= 0.4;
    return true;
  }
  return false;
}

/** The player driving: throttle, steering, grip and drag, then the city. */
export function updatePlayerCar(car, drive, handbrake, dt, city) {
  const forward = drive.throttle;
  if (forward > 0) car.speed += car.accel * dt;
  else if (forward < 0) {
    if (car.speed > 30) car.speed -= CAR.brake * dt;
    else car.speed -= 260 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * CAR.drag * 120 * dt;
    if (Math.abs(car.speed) < 8) car.speed = 0;
  }
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * 900 * dt;
    if (Math.abs(car.speed) < 20) car.speed = 0;
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, car.maxSpeed);
  const speedFactor = clamp(Math.abs(car.speed) / 240, 0, 1);
  car.angle += drive.steer * CAR.steer * speedFactor * Math.sign(car.speed || 1) * dt;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  collideCarWithCity(car, city);
}

/** Traffic: follow the lane, slow for the car ahead, turn at intersections. */
export function updateTrafficCar(car, cars, dt, random) {
  // Find the car ahead in the same lane.
  let ahead = null;
  let aheadD = Infinity;
  for (const other of cars) {
    if (other === car || other.kind === 'parked') continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const across = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (along > 0 && along < 90 && across < 34 && along < aheadD) { aheadD = along; ahead = other; }
  }
  const target = ahead ? Math.max(0, ahead.speed) : car.cruise;
  car.speed += clamp(target - car.speed, -500 * dt, 260 * dt);

  // Steer back onto the lane.
  let wantAngle;
  if (car.road === 'avenue') {
    const laneX = car.roadAt + (car.dir > 0 ? -30 : 30);
    wantAngle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const off = laneX - car.x;
    wantAngle += clamp(off * 0.004, -0.5, 0.5);
  } else {
    const laneY = car.roadAt + (car.dir > 0 ? 30 : -30);
    wantAngle = car.dir > 0 ? 0 : Math.PI;
    const off = laneY - car.y;
    wantAngle += clamp(off * 0.004, -0.5, 0.5);
  }
  car.angle += clamp(angleDiff(car.angle, wantAngle), -1.6 * dt, 1.6 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // At an intersection, sometimes turn onto the crossing road.
  const nearAvenue = AVENUES.some((a) => Math.abs(car.x - a) < 26);
  const nearStreet = STREETS.some((s) => Math.abs(car.y - s) < 26);
  if (nearAvenue && nearStreet && random() < 0.004) {
    if (car.road === 'avenue') {
      const street = STREETS.reduce((best, s) => (Math.abs(s - car.y) < Math.abs(best - car.y) ? s : best), STREETS[0]);
      car.road = 'street';
      car.roadAt = street;
      car.dir = random() < 0.5 ? 1 : -1;
    } else {
      const avenue = AVENUES.reduce((best, a) => (Math.abs(a - car.x) < Math.abs(best - car.x) ? a : best), AVENUES[0]);
      car.road = 'avenue';
      car.roadAt = avenue;
      car.dir = random() < 0.5 ? 1 : -1;
    }
  }
  if (collideCarWithCity(car, { buildings: [] })) {
    // Should not happen on roads; nudge back onto the nearest road.
    const road = nearestRoad(car.x, car.y);
    if (road && road.road === 'avenue') car.x = road.at;
    if (road && road.road === 'street') car.y = road.at;
  }
  // Leaving the city: respawn on the opposite side.
  if (car.x < -80 || car.x > WORLD.width + 80 || car.y < -80 || car.y > WORLD.height + 80) {
    const fresh = spawnTrafficCar(random);
    Object.assign(car, fresh);
  }
}

/** A police cruiser hunting the player: steer at them, ram, and keep pace. */
export function updatePoliceCar(car, target, dt) {
  const d = dist(car.x, car.y, target.x, target.y);
  const wantAngle = angleTo(car.x, car.y, target.x, target.y);
  const turn = clamp(angleDiff(car.angle, wantAngle), -2.4 * dt, 2.4 * dt);
  car.angle += turn;
  const desired = d > 260 ? car.maxSpeed : d > 90 ? car.maxSpeed * 0.75 : 240;
  car.speed += clamp(desired - car.speed, -600 * dt, 420 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

/** Pairwise car shoves: overlapping cars push apart and trade a little speed. */
export function collideCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const d = dist(a.x, a.y, b.x, b.y);
      const min = 44;
      if (d >= min || d < 0.01) continue;
      const push = (min - d) / 2;
      const nx = (b.x - a.x) / d;
      const ny = (b.y - a.y) / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const avg = (a.speed + b.speed) / 2;
      a.speed = avg * 0.7;
      b.speed = avg * 0.7;
    }
  }
}

export { isOnRoad };
