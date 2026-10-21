/** Lightweight dice finishes shared by storage, flight and resting dice.
 * All looks are procedural and self-contained: no texture downloads. */
export const DICE_SIDES=[2,4,6,8,10,12,20,100] as const;
export const DICE_THEMES=[
  {id:'royal-gold',name:'Royal Gold',family:'metal',base:'#dcb46b',second:'#fff0bf',edge:'#fbe5a8',ink:'#20252c',roughness:.22,metalness:.68},
  {id:'silver-filigree',name:'Silver Filigree',family:'metal',base:'#a5bac9',second:'#eef7ff',edge:'#f3f9ff',ink:'#1d3342',roughness:.25,metalness:.65},
  {id:'antique-bronze',name:'Antique Bronze',family:'metal',base:'#976440',second:'#d5a06c',edge:'#edbd83',ink:'#fff4d6',roughness:.35,metalness:.58},
  {id:'ruby-gem',name:'Ruby Crystal',family:'crystal',base:'#921a42',second:'#f75886',edge:'#ff9fb8',ink:'#fff0d5',roughness:.14,metalness:.12},
  {id:'sapphire-gem',name:'Sapphire Crystal',family:'crystal',base:'#1a4aa5',second:'#6dccff',edge:'#bdeaff',ink:'#f8f6e5',roughness:.13,metalness:.12},
  {id:'emerald-gem',name:'Emerald Crystal',family:'crystal',base:'#126750',second:'#7af2b0',edge:'#baffdb',ink:'#fff6d7',roughness:.13,metalness:.10},
  {id:'amethyst-gem',name:'Amethyst Crystal',family:'crystal',base:'#632f9b',second:'#dd99ff',edge:'#eacbff',ink:'#fff5d4',roughness:.12,metalness:.13},
  {id:'rose-quartz',name:'Rose Quartz',family:'stone',base:'#dc91ad',second:'#ffe1dc',edge:'#ffeae5',ink:'#5a284b',roughness:.26,metalness:.02},
  {id:'black-obsidian',name:'Black Obsidian',family:'enamel',base:'#151a2a',second:'#5e6280',edge:'#dfbf72',ink:'#f9de91',roughness:.11,metalness:.23},
  {id:'ivory-marble',name:'Ivory Marble',family:'stone',base:'#ece4d4',second:'#91969c',edge:'#c6a877',ink:'#2c3340',roughness:.35,metalness:.05},
  {id:'opal-moonstone',name:'Opal Moonstone',family:'pearlescent',base:'#c3e3ef',second:'#f9c2eb',edge:'#eaffff',ink:'#365472',roughness:.13,metalness:.15},
  {id:'aurora-glass',name:'Aurora Glass',family:'pearlescent',base:'#68f7df',second:'#9676f7',edge:'#e3faff',ink:'#22274b',roughness:.10,metalness:.11},
  {id:'galactic-nebula',name:'Galactic Nebula',family:'cosmic',base:'#181747',second:'#a05cdf',edge:'#ffcaff',ink:'#ffe8ba',roughness:.16,metalness:.24},
  {id:'inferno',name:'Inferno',family:'cosmic',base:'#4d1726',second:'#f66a30',edge:'#ffcf74',ink:'#fff2d3',roughness:.19,metalness:.28},
  {id:'arctic-frost',name:'Arctic Frost',family:'crystal',base:'#73b8d8',second:'#f2ffff',edge:'#ffffff',ink:'#245878',roughness:.24,metalness:.07},
  {id:'forest-malachite',name:'Forest Malachite',family:'stone',base:'#125848',second:'#79bd80',edge:'#dfd28a',ink:'#ffe4b4',roughness:.27,metalness:.07}
] as const;
export type DiceThemeId=typeof DICE_THEMES[number]['id'];
export type DiceTheme=typeof DICE_THEMES[number];
export const DEFAULT_DICE_THEME:DiceThemeId='royal-gold';
export interface DiceAppearance {all:DiceThemeId;overrides:Record<string,DiceThemeId>}
export const DEFAULT_DICE_APPEARANCE:DiceAppearance={all:DEFAULT_DICE_THEME,overrides:{}};
export function isDiceThemeId(value:unknown):value is DiceThemeId {
  return typeof value==='string'&&DICE_THEMES.some(t=>t.id===value);
}
export function normalizeDiceAppearance(value:unknown):DiceAppearance{
  if(!value||typeof value!=='object')return {...DEFAULT_DICE_APPEARANCE};
  const raw=value as Record<string,unknown>;
  const all=isDiceThemeId(raw.all)?raw.all:DEFAULT_DICE_THEME;
  const overrides:Record<string,DiceThemeId>={};
  if(raw.overrides&&typeof raw.overrides==='object')
    for(const [key,theme] of Object.entries(raw.overrides))
      if(DICE_SIDES.some(side=>String(side)===key)&&isDiceThemeId(theme))
        overrides[key]=theme;
  return {all,overrides};
}
export function resolveDiceTheme(appearance:DiceAppearance,sides:number):DiceThemeId{
  return appearance.overrides[String(sides)]??appearance.all;
}
export function diceTheme(id:DiceThemeId):DiceTheme{
  return DICE_THEMES.find(t=>t.id===id)??DICE_THEMES[0];
}
export const diceLabel=(sides:number)=>sides===2?'Flip Coin':
  'D'+String(sides).padStart(2,'0');
