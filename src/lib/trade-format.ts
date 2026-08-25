/**
 * Returns true when both sides of a trade resolve to the same item —
 * the marker for a points-only offer (the offeredItemId is set to the
 * listing's own item as a placeholder when no physical item is offered).
 */
export function isPointsOnlyTrade(
  offeredItemId: string,
  requestedItemId: string,
): boolean {
  return offeredItemId === requestedItemId
}

/**
 * Formats the canonical "A ⇄ B" trade title string.
 *
 * For points-only trades, the placeholder item on the giving side is
 * replaced with "N pts".  Pass isSender=true when the viewer is the one
 * who paid points (they gave pts, got the item); false when they received
 * points (they gave the item, got pts).
 */
export function formatTradeTitleStr(
  offeredItemTitle: string,
  requestedItemTitle: string,
  offeredPoints: number | null,
  isPointsOnly: boolean,
  isSender: boolean,
): string {
  if (isPointsOnly && (offeredPoints ?? 0) > 0) {
    const pts = `${offeredPoints!.toLocaleString()} pts`
    return isSender
      ? `${pts} ⇄ ${requestedItemTitle}`
      : `${requestedItemTitle} ⇄ ${pts}`
  }
  return `${offeredItemTitle} ⇄ ${requestedItemTitle}`
}
