// Small math and geometry helpers shared by every system. Nothing here knows about the
// game; each function takes plain numbers and returns plain numbers.

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

/** The shortest signed turn from angle `from` toward angle `to`, in (-PI, PI]. */
export function angleDiff(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(from, to, t) {
  return from + angleDiff(from, to) * t;
}

/** True when a circle at (cx, cy) with radius r touches the rectangle. */
export function circleHitsRect(cx, cy, r, rect) {
  const nearX = clamp(cx, rect.x, rect.x + rect.w);
  const nearY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < r * r;
}

/** Push a circle out of a rectangle it overlaps; returns true when it did. */
export function pushCircleOutOfRect(circle, rect) {
  const nearX = clamp(circle.x, rect.x, rect.x + rect.w);
  const nearY = clamp(circle.y, rect.y, rect.y + rect.h);
  let dx = circle.x - nearX;
  let dy = circle.y - nearY;
  const d2 = dx * dx + dy * dy;
  if (d2 >= circle.r * circle.r) return false;
  if (d2 < 0.0001) {
    // Centre inside the rectangle: push out along the smallest penetration.
    const left = circle.x - rect.x;
    const right = rect.x + rect.w - circle.x;
    const top = circle.y - rect.y;
    const bottom = rect.y + rect.h - circle.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) circle.x = rect.x - circle.r;
    else if (m === right) circle.x = rect.x + rect.w + circle.r;
    else if (m === top) circle.y = rect.y - circle.r;
    else circle.y = rect.y + rect.h + circle.r;
    return true;
  }
  const d = Math.sqrt(d2);
  dx /= d;
  dy /= d;
  circle.x = nearX + dx * circle.r;
  circle.y = nearY + dy * circle.r;
  return true;
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Pick one entry of an array with a seeded random. */
export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

/** A short random identifier for a car or pedestrian, used by the save and the HUD. */
export function makeId(random) {
  return Math.floor(random() * 1e9).toString(36);
}
