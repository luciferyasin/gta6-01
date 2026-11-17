// Solmar Bay itself: a grid of avenues and streets, blocks of buildings, a central park,
// a beach along the south edge and a marina on the east. Everything is generated from one
// seed, so the same seed always builds the same city. The module also answers the two
// questions the rest of the game keeps asking: "is this spot solid?" and "where is a road?"

import { AVENUES, BEACH, MARINA, PALETTE, ROAD_WIDTH, STREETS, WORLD } from './config.js';
import { clamp, pick } from './utils.js';

const ROAD_HALF = ROAD_WIDTH / 2;
const SIDEWALK = 14;

/** The blocks between roads, as {x, y, w, h} rectangles. */
function blockRects() {
  const xs = [0, ...AVENUES, WORLD.width];
  const ys = [0, ...STREETS, WORLD.height];
  const blocks = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const x0 = i === 0 ? 0 : xs[i] + ROAD_HALF + SIDEWALK;
      const x1 = i === xs.length - 2 ? WORLD.width : xs[i + 1] - ROAD_HALF - SIDEWALK;
      const y0 = j === 0 ? 0 : ys[j] + ROAD_HALF + SIDEWALK;
      const y1 = j === ys.length - 2 ? WORLD.height : ys[j + 1] - ROAD_HALF - SIDEWALK;
      blocks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, col: i, row: j });
    }
  }
  return blocks;
}

/** The block that holds the central park (between avenues 1600-2200, streets 1400-1900). */
function isParkBlock(block) {
  return block.col === 3 && block.row === 3;
}

/** The block that holds the beach strip is the whole southern row; the marina is the east. */
function isBeachBlock(block) {
  return block.y + block.h >= BEACH.y;
}

export function generateCity(random) {
  const buildings = [];
  const trees = [];
  const lamps = [];
  const blocks = blockRects();

  // One building (or a pair) per block, with a margin for the sidewalk.
  for (const block of blocks) {
    if (isParkBlock(block) || isBeachBlock(block)) continue;
    if (block.w < 140 || block.h < 120) continue;
    const count = block.w > 420 && block.h > 320 ? 2 : 1;
    for (let n = 0; n < count; n += 1) {
      const w = 130 + random() * 150;
      const h = 110 + random() * 130;
      const x = block.x + 18 + random() * Math.max(1, block.w - w - 36);
      const y = block.y + 18 + random() * Math.max(1, block.h - h - 36);
      buildings.push({
        x, y, w, h,
        roof: pick(random, PALETTE.buildingRoof),
        height: 8 + random() * 26,
        floors: 2 + Math.floor(random() * 5),
      });
    }
  }

  // The central park: a pond, a ring of trees and a few benches (drawn as small rects).
  const park = { x: 1674, y: 1474, w: 452, h: 352 };
  const pond = { x: 1840, y: 1580, w: 150, h: 110 };
  for (let i = 0; i < 46; i += 1) {
    const x = park.x + 20 + random() * (park.w - 40);
    const y = park.y + 20 + random() * (park.h - 40);
    if (x > pond.x - 30 && x < pond.x + pond.w + 30 && y > pond.y - 30 && y < pond.y + pond.h + 30) continue;
    trees.push({ x, y, r: 12 + random() * 10, palm: false });
  }

  // Palm trees along the beach and the marina promenade.
  for (let x = 120; x < WORLD.width - 200; x += 90 + random() * 60) {
    trees.push({ x, y: BEACH.y + 40 + random() * 60, r: 14, palm: true });
  }
  for (let y = MARINA.y0 + 60; y < MARINA.y1; y += 110) {
    trees.push({ x: MARINA.x - 90, y, r: 13, palm: true });
  }
  // Street trees on random sidewalk corners.
  for (let i = 0; i < 90; i += 1) {
    const avenue = pick(random, AVENUES);
    const street = pick(random, STREETS);
    const side = random() < 0.5 ? -1 : 1;
    trees.push({
      x: avenue + side * (ROAD_HALF + 26) + (random() - 0.5) * 20,
      y: street + (random() < 0.5 ? -1 : 1) * (ROAD_HALF + 26) + (random() - 0.5) * 20,
      r: 10 + random() * 8,
      palm: random() < 0.35,
    });
  }

  // Street lamps at intersections.
  for (const avenue of AVENUES) {
    for (const street of STREETS) {
      lamps.push({ x: avenue + ROAD_HALF + 8, y: street - ROAD_HALF - 8 });
      lamps.push({ x: avenue - ROAD_HALF - 8, y: street + ROAD_HALF + 8 });
    }
  }

  // Key places, each a named spot the missions and the HUD point at.
  const places = {
    // Vera's garage: the low wide building in the block south-west of downtown.
    garage: { x: 1180, y: 2560, label: "Vera's Garage" },
    // The safehouse: a small house in the north-west block.
    safehouse: { x: 700, y: 640, label: 'Safehouse' },
    // The hospital, north-east.
    hospital: { x: 3680, y: 640, label: 'Solmar General' },
    // The police station, west.
    policeStation: { x: 700, y: 2120, label: 'Solmar PD' },
    // The gold Veloce GT waits in the marina lot.
    marinaLot: { x: 4560, y: 800, label: 'Marina Lot' },
    // Mission 2 package spots.
    packageDowntown: { x: 2200, y: 900, label: 'Package 1' },
    packagePark: { x: 1900, y: 1650, label: 'Package 2' },
    packageBeach: { x: 2800, y: 3340, label: 'Package 3' },
    // The drop-off for mission 2, behind the garage.
    dropoff: { x: 1330, y: 2720, label: 'Drop-off' },
    // Where a new game starts: the sidewalk outside the garage.
    spawn: { x: 1180, y: 2400 },
  };

  // Mark the key-place buildings so the renderer can draw them distinctly.
  buildings.push({ x: 1060, y: 2480, w: 240, h: 150, roof: '#c96f4a', height: 10, floors: 1, place: 'garage' });
  buildings.push({ x: 640, y: 590, w: 120, h: 100, roof: '#5a8a6f', height: 8, floors: 1, place: 'safehouse' });
  buildings.push({ x: 3600, y: 560, w: 200, h: 170, roof: '#e8e8e8', height: 22, floors: 3, place: 'hospital' });
  buildings.push({ x: 620, y: 2040, w: 180, h: 150, roof: '#1f3a8a', height: 14, floors: 2, place: 'policeStation' });

  return { buildings, trees, lamps, park, pond, places };
}

/** True when a point is inside the water or outside the world. */
export function isWater(x, y) {
  return y >= BEACH.waterY || x < 0 || y < 0 || x >= WORLD.width || y >= WORLD.height;
}

/** Push a circle out of every building it overlaps and out of the water; returns true on hit. */
export function collideCity(circle, city) {
  let hit = false;
  for (const b of city.buildings) {
    const nearX = clamp(circle.x, b.x, b.x + b.w);
    const nearY = clamp(circle.y, b.y, b.y + b.h);
    const dx = circle.x - nearX;
    const dy = circle.y - nearY;
    if (dx * dx + dy * dy < circle.r * circle.r) {
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      circle.x = nearX + (dx / d) * circle.r;
      circle.y = nearY + (dy / d) * circle.r;
      hit = true;
    }
  }
  if (circle.y + circle.r > BEACH.waterY) {
    circle.y = BEACH.waterY - circle.r;
    hit = true;
  }
  if (circle.x - circle.r < 0) { circle.x = circle.r; hit = true; }
  if (circle.x + circle.r > WORLD.width) { circle.x = WORLD.width - circle.r; hit = true; }
  if (circle.y - circle.r < 0) { circle.y = circle.r; hit = true; }
  if (circle.y + circle.r > WORLD.height) { circle.y = WORLD.height - circle.r; hit = true; }
  return hit;
}

/** True when the point is on a road surface (avenue or street). */
export function isOnRoad(x, y) {
  for (const a of AVENUES) if (Math.abs(x - a) <= ROAD_HALF) return true;
  for (const s of STREETS) if (Math.abs(y - s) <= ROAD_HALF) return true;
  return false;
}

/** A random point on a road, with the road's direction, for traffic to spawn on. */
export function randomRoadPoint(random) {
  if (random() < 0.5) {
    const avenue = pick(random, AVENUES);
    const dir = random() < 0.5 ? 1 : -1;
    return {
      x: avenue + (dir > 0 ? 30 : -30),
      y: random() * WORLD.height,
      angle: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
      road: 'avenue', roadX: avenue, dir,
    };
  }
  const street = pick(random, STREETS);
  const dir = random() < 0.5 ? 1 : -1;
  return {
    x: random() * WORLD.width,
    y: street + (dir > 0 ? 30 : -30),
    angle: dir > 0 ? 0 : Math.PI,
    road: 'street', roadY: street, dir,
  };
}

/** The nearest road centre and which way it runs, for a car that needs a lane. */
export function nearestRoad(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const a of AVENUES) {
    const d = Math.abs(x - a);
    if (d < bestD) { bestD = d; best = { road: 'avenue', at: a, dist: d }; }
  }
  for (const s of STREETS) {
    const d = Math.abs(y - s);
    if (d < bestD) { bestD = d; best = { road: 'street', at: s, dist: d }; }
  }
  return best;
}
