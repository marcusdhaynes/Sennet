/** Placement of a loose tabletop book inside a sliding drawer.
 * Coordinates are local to the same playmat, NOT screen/CSS pixels.
 * Keep the object anchored to the drawer's OPEN position when persisting.
 */
export interface DrawerWell {
  x:number;y:number;width:number;height:number;
}
export function isBookWithinDrawer(
  x:number,y:number,bookWidth:number,bookHeight:number,
  well:DrawerWell,slideX=0,tolerance=4.5
):boolean{
  if(![x,y,bookWidth,bookHeight,well.x,well.y,well.width,well.height,slideX]
    .every(Number.isFinite)||bookWidth<=0||bookHeight<=0||
    well.width<=0||well.height<=0)return false;
  return Math.abs(x-(well.x+slideX))+bookWidth/2<=well.width/2+tolerance&&
    Math.abs(y-well.y)+bookHeight/2<=well.height/2+tolerance;
}
/** Physical center and inner-wall dimensions from createDrawerBody.
 * Its texture is (trayWidth+24)×(trayHeight+24), and the felt well has
 * 14-pixel side insets, 15-pixel top and 20-pixel bottom insets.
 */
export function drawerInnerWell(
  centerX:number,centerY:number,trayWidth:number,trayHeight:number
):DrawerWell{
  return {x:centerX,y:centerY-2.5,
    width:trayWidth-4,height:trayHeight-11};
}
/** The saved X position is ALWAYS relative to the OPEN drawer pose. */
export function bookOpenPoseX(visibleX:number,drawerShiftX:number):number{
  return visibleX-drawerShiftX;
}
