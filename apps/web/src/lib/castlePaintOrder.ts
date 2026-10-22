/** The explicit, global Pixi painter order, from farthest back to front.
 * Castle opponents' playmats are LOWER than even accessories and the
 * viewer's own playmat. RenderLayer attachment preserves the seat matrix
 * and interaction ancestry of cards and buttons. */
export const TABLE_PAINT_ORDER=[
  'castleOpponentPlaymats',
  'labels',
  'accessories',
  'playmats',
  'buttons',
  'objects'
] as const;

export type TablePaintLayerName=(typeof TABLE_PAINT_ORDER)[number];

/** Only OTHER players' Castle mats get the lowest layer.
 * The viewer's playmat and every non-Castle mat keep normal rendering. */
export function playmatPaintLayer(
  castleActive:boolean,seat:number,viewerSeat:number
):'castleOpponentPlaymats'|'playmats'{
  return castleActive&&seat!==viewerSeat?'castleOpponentPlaymats':'playmats';
}
