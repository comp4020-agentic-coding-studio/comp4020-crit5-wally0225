// Derives which cells survive a pillar sweep from wherever the walls are,
// rather than hard-coding the four direction-specific lists: a pillar enters
// from the edge named by its direction and travels across its row/column
// until a wall stops it. Any row/column with no wall gets swept end to end.
export type Direction = "up" | "down" | "left" | "right";

export interface Wall {
  col: number;
  row: number;
}

export function cellId(col: number, row: number): string {
  return `${"abcde"[col - 1]}${row}`;
}

// How many cells a pillar in this lane travels before it's stopped by a wall
// (or reaches the far edge, if none blocks it) --- used to size the pillar
// visually. Stops one cell short of a wall's row/column so the pillar never
// visually covers the wall itself.
export function travelDistance(
  direction: Direction,
  lane: number,
  walls: Wall[],
  n = 5,
): number {
  if (direction === "up" || direction === "down") {
    const relevant = walls.filter((w) => w.col === lane);
    if (relevant.length === 0) return n;
    return direction === "up"
      ? Math.min(...relevant.map((w) => w.row)) - 1
      : n - Math.max(...relevant.map((w) => w.row));
  }
  const relevant = walls.filter((w) => w.row === lane);
  if (relevant.length === 0) return n;
  return direction === "left"
    ? Math.min(...relevant.map((w) => w.col)) - 1
    : n - Math.max(...relevant.map((w) => w.col));
}

export function safeCellsForDirections(
  directions: Direction[],
  walls: Wall[],
  n = 5,
): Set<string> {
  return directions
    .map((direction) => safeCellsForDirection(direction, walls, n))
    .reduce((acc, safe) => new Set([...acc].filter((id) => safe.has(id))));
}

export function safeCellsForDirection(
  direction: Direction,
  walls: Wall[],
  n = 5,
): Set<string> {
  const safe = new Set<string>();

  if (direction === "up" || direction === "down") {
    for (let col = 1; col <= n; col++) {
      const wallsInCol = walls.filter((w) => w.col === col);
      if (wallsInCol.length === 0) continue;
      const blockingRow =
        direction === "up"
          ? Math.min(...wallsInCol.map((w) => w.row))
          : Math.max(...wallsInCol.map((w) => w.row));
      for (let row = 1; row <= n; row++) {
        const beyondWall = direction === "up" ? row > blockingRow : row < blockingRow;
        const isWallCell = wallsInCol.some((w) => w.row === row);
        if (beyondWall && !isWallCell) safe.add(cellId(col, row));
      }
    }
  } else {
    for (let row = 1; row <= n; row++) {
      const wallsInRow = walls.filter((w) => w.row === row);
      if (wallsInRow.length === 0) continue;
      const blockingCol =
        direction === "left"
          ? Math.min(...wallsInRow.map((w) => w.col))
          : Math.max(...wallsInRow.map((w) => w.col));
      for (let col = 1; col <= n; col++) {
        const beyondWall = direction === "left" ? col > blockingCol : col < blockingCol;
        const isWallCell = wallsInRow.some((w) => w.col === col);
        if (beyondWall && !isWallCell) safe.add(cellId(col, row));
      }
    }
  }

  return safe;
}
