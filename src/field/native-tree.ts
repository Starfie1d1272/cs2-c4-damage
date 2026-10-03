import type { Vec3 } from './types.js';

const f = Math.fround;
const axes = ['x', 'y', 'z'] as const;
type Node = {
  start: number;
  end: number;
  axis?: 'x' | 'y' | 'z';
  split?: number;
  left?: Node;
  right?: Node;
};
export const finiteFloatVec = (p: Vec3): boolean =>
  !!p &&
  axes.every((k) => typeof p[k] === 'number' && Number.isFinite(f(p[k])));
export const floatVec = (p: Vec3): Vec3 => ({
  x: f(p.x),
  y: f(p.y),
  z: f(p.z),
});

/** Midpoint tree and two-sweep partition recovered from the pinned tier0 build.
 * Copies inputs so subsequent caller mutation cannot invalidate the tree.
 */
export function createNativeTree(input: readonly Vec3[]) {
  if (!input.length || !input.every(finiteFloatVec))
    throw new Error('invalid-tree-positions');
  const positions = input.map(floatVec);
  const order = positions.map((_, i) => i);
  const swap = (a: number, b: number) => {
    [order[a], order[b]] = [order[b]!, order[a]!];
  };
  function build(start: number, end: number): Node {
    const node: Node = { start, end };
    if (end - start <= 8) return node;
    const min = { ...positions[order[start]!]! },
      max = { ...min };
    for (let i = start + 1; i < end; i++)
      for (const k of axes) {
        min[k] = Math.min(min[k], positions[order[i]!]![k]);
        max[k] = Math.max(max[k], positions[order[i]!]![k]);
      }
    const dx = f(max.x - min.x),
      dy = f(max.y - min.y),
      dz = f(max.z - min.z);
    const axis = dx >= dy ? (dx > dz ? 'x' : 'z') : dy > dz ? 'y' : 'z';
    const split = f(f(min[axis] + max[axis]) * 0.5);
    // This is not sorting or a stable partition. Its order controls native ties.
    let pivot = start + Math.floor((end - start) / 2);
    for (let i = pivot; i < end; i++)
      if (positions[order[i]!]![axis] < split) swap(pivot++, i);
    let tail = pivot - 1;
    for (let i = tail; i >= start; i--)
      if (positions[order[i]!]![axis] >= split) {
        swap(tail--, i);
        pivot--;
      }
    if (pivot === start || pivot === end) return node;
    return {
      ...node,
      axis,
      split,
      left: build(start, pivot),
      right: build(pivot, end),
    };
  }
  const root = build(0, order.length);
  return {
    nearest(
      point: Vec3,
    ): { positionIndex: number; distanceSquared: number } | undefined {
      if (!finiteFloatVec(point)) return undefined;
      const p = floatVec(point);
      let distanceSquared = f(3.4028234663852886e38),
        positionIndex = -1;
      function visit(node: Node): void {
        if (node.axis !== undefined) {
          const delta = f(p[node.axis] - node.split!);
          const leftFirst = node.split! > p[node.axis];
          visit(leftFirst ? node.left! : node.right!);
          if (distanceSquared > f(delta * delta))
            visit(leftFirst ? node.right! : node.left!);
          return;
        }
        for (let i = node.start; i < node.end; i++) {
          const index = order[i]!,
            q = positions[index]!;
          const x = f(q.x - p.x),
            y = f(q.y - p.y),
            z = f(q.z - p.z);
          const d = f(f(f(y * y) + f(x * x)) + f(z * z));
          if (d < distanceSquared) {
            distanceSquared = d;
            positionIndex = index;
          }
        }
      }
      visit(root);
      return positionIndex < 0 ? undefined : { positionIndex, distanceSquared };
    },
  };
}
