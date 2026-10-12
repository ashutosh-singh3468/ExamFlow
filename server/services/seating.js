import { buildSeats, neighborCoords, seatKey } from '../../shared/layout.js';

/**
 * Seating generator.
 *
 * 1. Every room is turned into a seat graph (usable seats + neighbour lists for the chosen
 *    adjacency rule) and we estimate how many students of a single paper it can hold without
 *    two of them touching (a greedy independent set).
 * 2. The share of the largest paper tells us how full each room can be while still keeping
 *    papers apart. Rooms are picked (fewest needed, largest first) and students are spread
 *    evenly across them, each room receiving a proportional, roll-ordered slice of every paper.
 * 3. Inside a room seats are filled column by column, always choosing the paper with the most
 *    students still waiting that does not clash with neighbours already seated. Spare seats
 *    become buffers when nothing fits. A min-conflicts swap search then repairs leftovers.
 * 4. Actual students are laid onto the pattern in seat-number order so roll numbers run
 *    sequentially through each room.
 */

export function prepareRoom(room, mode) {
  const seats = buildSeats(room.layout, room.blocked || []);
  const index = new Map(seats.map((s, i) => [s.key, i]));
  const adj = seats.map((s) =>
    neighborCoords(room.layout, s.r, s.c, mode)
      .map(([r, c]) => index.get(seatKey(r, c)))
      .filter((i) => i !== undefined),
  );
  const fillOrder = seats.map((_, i) => i).sort((a, b) => seats[a].c - seats[b].c || seats[a].r - seats[b].r);
  // previous seat in the same column (front of the current seat) for "column continuity"
  const above = seats.map((s) => {
    const i = index.get(seatKey(s.r - 1, s.c));
    return i === undefined ? -1 : i;
  });
  const taken = new Array(seats.length).fill(false);
  let independent = 0;
  for (const i of fillOrder) {
    if (adj[i].every((j) => !taken[j])) {
      taken[i] = true;
      independent++;
    }
  }
  return { ...room, seats, index, adj, fillOrder, above, capacity: seats.length, independent };
}

function apportion(total, weights, caps) {
  // Largest-remainder split of `total` proportional to weights, respecting caps.
  const n = weights.length;
  const out = new Array(n).fill(0);
  let remaining = total;
  for (let guard = 0; guard < 100 && remaining > 0; guard++) {
    const active = [];
    for (let i = 0; i < n; i++) if (weights[i] > 0 && out[i] < caps[i]) active.push(i);
    if (!active.length) break;
    const wsum = active.reduce((s, i) => s + weights[i], 0);
    const raw = active.map((i) => ({ i, v: (remaining * weights[i]) / wsum }));
    let given = 0;
    for (const { i, v } of raw) {
      const add = Math.min(Math.floor(v), caps[i] - out[i]);
      out[i] += add;
      given += add;
    }
    let left = remaining - given;
    raw.sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)));
    for (const { i } of raw) {
      if (left <= 0) break;
      if (out[i] < caps[i]) {
        out[i]++;
        left--;
      }
    }
    if (left === remaining) break; // no progress possible
    remaining = left;
  }
  return out;
}

function placeInRoom(room, quotas, rng) {
  const n = room.seats.length;
  const assign = new Array(n).fill(-1);
  const left = [...quotas];
  let toPlace = left.reduce((a, b) => a + b, 0);
  let seatsLeft = n;

  for (const i of room.fillOrder) {
    if (toPlace === 0) break;
    const spare = seatsLeft - toPlace;
    seatsLeft--;
    const forbidden = new Set();
    for (const j of room.adj[i]) if (assign[j] >= 0) forbidden.add(assign[j]);
    let best = -1;
    let bestScore = -Infinity;
    for (let k = 0; k < left.length; k++) {
      if (left[k] <= 0 || forbidden.has(k)) continue;
      let score = left[k] / toPlace;
      if (room.above[i] >= 0 && assign[room.above[i]] === k) score += 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }
    if (best === -1) {
      if (spare > 0) continue; // leave as a buffer seat
      // forced: take the paper with the most students left (repair later)
      best = left.reduce((bi, v, k) => (v > (left[bi] ?? -1) ? k : bi), 0);
    }
    assign[i] = best;
    left[best]--;
    toPlace--;
  }

  repair(room, assign, rng);
  return assign;
}

function localConflicts(room, assign, i) {
  const g = assign[i];
  if (g < 0) return 0;
  let c = 0;
  for (const j of room.adj[i]) if (assign[j] === g) c++;
  return c;
}

export function countConflicts(room, assign) {
  let total = 0;
  for (let i = 0; i < assign.length; i++) total += localConflicts(room, assign, i);
  return total / 2;
}

function repair(room, assign, rng) {
  const n = assign.length;
  let conflicts = countConflicts(room, assign);
  let iter = 0;
  const maxIter = 4000;
  while (conflicts > 0 && iter++ < maxIter) {
    const bad = [];
    for (let i = 0; i < n; i++) if (localConflicts(room, assign, i) > 0) bad.push(i);
    if (!bad.length) break;
    const i = bad[Math.floor(rng() * bad.length)];
    let bestJ = -1;
    let bestDelta = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i || assign[j] === assign[i]) continue;
      const before =
        localConflicts(room, assign, i) + localConflicts(room, assign, j) + sumNeighbourConflicts(room, assign, i, j);
      swap(assign, i, j);
      const after =
        localConflicts(room, assign, i) + localConflicts(room, assign, j) + sumNeighbourConflicts(room, assign, i, j);
      swap(assign, i, j);
      const delta = after - before;
      if (delta < bestDelta || (delta === bestDelta && rng() < 0.3)) {
        bestDelta = delta;
        bestJ = j;
      }
    }
    if (bestJ === -1) break;
    if (bestDelta < 0 || (bestDelta === 0 && rng() < 0.35)) {
      swap(assign, i, bestJ);
      conflicts = countConflicts(room, assign);
    }
  }
}

function sumNeighbourConflicts(room, assign, i, j) {
  // conflicts counted from the neighbours' side (excluding i and j themselves)
  let c = 0;
  for (const k of room.adj[i]) if (k !== j && assign[k] >= 0 && assign[k] === assign[i]) c++;
  for (const k of room.adj[j]) if (k !== i && assign[k] >= 0 && assign[k] === assign[j]) c++;
  return c;
}

function swap(a, i, j) {
  const t = a[i];
  a[i] = a[j];
  a[j] = t;
}

export function seededRandom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {Array<{id:number,name:string,layout:object,blocked:string[]}>} rooms ordered by preference
 * @param {Array<{paperId:number, students:Array<{id:number}>}>} groups students already roll-sorted
 * @param {{adjacency?:string, roomUsage?:'minimum'|'all', seed?:number}} options
 */
export function generateSeating(rooms, groups, options = {}) {
  const mode = options.adjacency || 'cross';
  const rng = seededRandom(options.seed ?? Date.now());
  const counts = groups.map((g) => g.students.length);
  const N = counts.reduce((a, b) => a + b, 0);
  const prepared = rooms.map((r) => prepareRoom(r, mode)).filter((r) => r.capacity > 0);

  const result = { assignments: [], unseated: [], roomsUsed: [], roomStats: [], warnings: [] };
  if (N === 0) {
    result.warnings.push('No students match the papers in this slot.');
    return result;
  }
  if (!prepared.length) {
    result.unseated = groups.flatMap((g) => g.students.map((s) => s.id));
    result.warnings.push('No classrooms with usable seats were selected.');
    return result;
  }

  const pmax = Math.max(...counts) / N;
  for (const r of prepared) r.effective = Math.max(1, Math.min(r.capacity, Math.floor(r.independent / pmax)));

  let used;
  if (options.roomUsage === 'all') {
    used = [...prepared];
  } else {
    const byCapacity = [...prepared].sort((a, b) => b.effective - a.effective || b.capacity - a.capacity);
    used = [];
    let acc = 0;
    for (const r of byCapacity) {
      if (acc >= N) break;
      used.push(r);
      acc += r.effective;
    }
    // trim: if a smaller combination exists by swapping the last room for a smaller one, prefer it
    if (used.length > 1) {
      const last = used[used.length - 1];
      const before = acc - last.effective;
      const smaller = byCapacity
        .filter((r) => !used.includes(r) && before + r.effective >= N && r.effective < last.effective)
        .sort((a, b) => a.effective - b.effective)[0];
      if (smaller) used[used.length - 1] = smaller;
    }
    // keep the admin's room order for presentation
    used.sort((a, b) => prepared.indexOf(a) - prepared.indexOf(b));
  }

  const totalEffective = used.reduce((s, r) => s + r.effective, 0);
  const totalCapacity = used.reduce((s, r) => s + r.capacity, 0);
  let targets;
  if (totalEffective >= N) {
    targets = apportion(
      N,
      used.map((r) => r.effective),
      used.map((r) => r.effective),
    );
  } else {
    // Not enough spaced seating — fill spaced capacity first, then squeeze into remaining seats.
    targets = used.map((r) => r.effective);
    const extra = apportion(
      Math.min(N, totalCapacity) - totalEffective,
      used.map((r) => r.capacity - r.effective),
      used.map((r) => r.capacity - r.effective),
    );
    targets = targets.map((t, i) => t + extra[i]);
    if (totalCapacity >= N) {
      result.warnings.push(
        `Selected rooms are too small to keep every paper apart. ${N - totalEffective} student(s) had to be seated next to the same paper — add a room to remove clashes.`,
      );
    } else {
      result.warnings.push(
        `Selected rooms only have ${totalCapacity} seats for ${N} students. ${N - totalCapacity} student(s) could not be seated.`,
      );
    }
  }

  const seatable = targets.reduce((a, b) => a + b, 0);
  // how many from each paper get seats (only differs from counts when rooms are too small)
  const seatCounts = seatable >= N ? [...counts] : apportion(seatable, counts, counts);
  const rem = [...seatCounts];
  let R = seatable;
  const pointers = groups.map(() => 0);

  used.forEach((room, idx) => {
    const t = targets[idx];
    if (t <= 0) return;
    const quotas = idx === used.length - 1 || R === t ? [...rem] : apportion(t, rem, rem);
    rem.forEach((_, k) => (rem[k] -= quotas[k]));
    R -= t;

    const assign = placeInRoom(room, quotas, rng);
    // Lay students onto the pattern in seat-number order.
    const seatsByGroup = groups.map(() => []);
    room.seats.forEach((s, i) => {
      if (assign[i] >= 0) seatsByGroup[assign[i]].push(s);
    });
    let seated = 0;
    seatsByGroup.forEach((list, k) => {
      list.sort((a, b) => a.order - b.order);
      for (const s of list) {
        const student = groups[k].students[pointers[k]++];
        if (!student) continue;
        result.assignments.push({ room_id: room.id, r: s.r, c: s.c, student_id: student.id, paper_id: groups[k].paperId });
        seated++;
      }
    });
    result.roomsUsed.push(room.id);
    result.roomStats.push({ room_id: room.id, seated, capacity: room.capacity, conflicts: countConflicts(room, assign) });
  });

  groups.forEach((g, k) => {
    for (let i = pointers[k]; i < g.students.length; i++) result.unseated.push(g.students[i].id);
  });
  return result;
}

/** Count same-paper neighbours for an existing set of assignments in one room. */
export function roomConflicts(room, mode, paperBySeat) {
  const prepared = prepareRoom(room, mode);
  const pairs = [];
  prepared.seats.forEach((s, i) => {
    const p = paperBySeat.get(s.key);
    if (p == null) return;
    for (const j of prepared.adj[i]) {
      if (j <= i) continue;
      const o = prepared.seats[j];
      if (paperBySeat.get(o.key) === p) pairs.push([s.key, o.key]);
    }
  });
  return pairs;
}
