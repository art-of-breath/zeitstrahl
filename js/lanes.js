// Lasting events that overlap sit side by side. Greedy packing: each one takes the
// first lane that is free by the time it starts. Returns the number of lanes used.

export function packLanes(items) {
  const ends = [];
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);
  for (const it of sorted) {
    let lane = ends.findIndex(end => end <= it.s);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = it.e;
    it.lane = lane;
  }
  return ends.length;
}

// Labels along one axis may not overlap. Vertical: push each one further along
// (with a leader line back to its moment). Horizontal: stack into rows.
export function pushAlong(labels, size, gap) {
  const sorted = [...labels].sort((a, b) => a.anchor - b.anchor);
  let next = -Infinity;
  for (const l of sorted) {
    l.at = Math.max(l.anchor - size / 2, next);
    next = l.at + size + gap;
  }
}

export function packRows(labels, gap) {
  const rowEnds = [];
  const sorted = [...labels].sort((a, b) => a.anchor - b.anchor);
  for (const l of sorted) {
    l.at = l.anchor;
    let row = rowEnds.findIndex(end => end + gap <= l.at);
    if (row < 0) { row = rowEnds.length; rowEnds.push(0); }
    rowEnds[row] = l.at + l.size;
    l.row = row;
  }
  return rowEnds.length;
}
