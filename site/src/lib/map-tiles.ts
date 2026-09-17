type Bounds = { left: number; top: number; right: number; bottom: number };
type Tile = { bounds: Bounds; complete: boolean; naturalWidth: number };

export function visibleTileStatus(viewport: Bounds, tiles: readonly Tile[]) {
  const visible = tiles.filter(({ bounds }) =>
    bounds.right > viewport.left && bounds.left < viewport.right &&
    bounds.bottom > viewport.top && bounds.top < viewport.bottom);
  return {
    available: visible.some((tile) => tile.complete && tile.naturalWidth > 0),
    failed: visible.some((tile) => tile.complete && tile.naturalWidth === 0),
    pending: visible.length === 0 || visible.some((tile) => !tile.complete),
  };
}
