import {useId,useState,type Dispatch,type SetStateAction} from 'react';
import {type PlaymatAppearance,type PlaymatSectionStyle,type PlaymatTextureKind,
  defaultPlaymatAppearance,playmatSectionIndex,tcgMatCells,tcgMatLocal,tcgMatRegions,
  tcgRegionLabel,TCG_ROW_COLORS,TCG_MAT_WIDTH,TCG_MAT_HEIGHT} from '@sennet/core';

interface Props {
  appearance:PlaymatAppearance;
  setAppearance:Dispatch<SetStateAction<PlaymatAppearance>>;
  merges:readonly number[];
  seat:number;
  inform:(message:string)=>void;
}
const textureKinds:PlaymatTextureKind[]=['matte','sandy','glossy'];
const textureTitles:Record<PlaymatTextureKind,string>={matte:'Matte',sandy:'Sandy / Gravel',glossy:'Glossy'};
const asColor=(hex:number)=>'#'+hex.toString(16).padStart(6,'0');

function LiveMatPreview({appearance,merges,seat,onToggle}:{
  appearance:PlaymatAppearance;merges:readonly number[];seat:number;
  onToggle:(index:number)=>void;
}){
  const id=useId().replace(/:/g,'');
  const cells=tcgMatCells(seat);
  const regions=tcgMatRegions(seat,merges);
  return <svg className="mat-live-svg"
    viewBox={'-8 -8 '+(TCG_MAT_WIDTH+16)+' '+(TCG_MAT_HEIGHT+16)}
    role="group" aria-label="Live Playmat Preview. Select Sections To Edit.">
    <defs>
      <pattern id={id+'-matte'} width="28" height="8" patternUnits="userSpaceOnUse">
        <path d="M4 3h12" fill="none" stroke="#9dbbb4" strokeWidth=".55"/>
      </pattern>
      <pattern id={id+'-sandy'} width="29" height="24" patternUnits="userSpaceOnUse">
        <circle cx="5" cy="7" r=".85" fill="#c7d2b9"/>
        <circle cx="21" cy="19" r=".7" fill="#c7d2b9"/>
        <circle cx="13" cy="3" r=".6" fill="#c7d2b9"/>
      </pattern>
      <pattern id={id+'-grid'} width="10" height="10" patternUnits="userSpaceOnUse">
        <path d="M10 0H0V10" fill="none" stroke="#7b9286" strokeWidth=".4" opacity=".18"/>
      </pattern>
    </defs>
    <rect x={-4} y={-4} width={TCG_MAT_WIDTH+8} height={TCG_MAT_HEIGHT+8}
      rx="12" fill="#101e1a" stroke="#8d7855" strokeOpacity=".46"/>
    {regions.map((region)=>{
      const local=tcgMatLocal(region.x,region.y,seat);
      const x=local.x+TCG_MAT_WIDTH/2-region.width/2;
      const y=local.y+TCG_MAT_HEIGHT/2-region.height/2;
      const w=region.width,h=region.height;
      const section=appearance.sections[playmatSectionIndex(region.row,region.column)];
      const accent=asColor(TCG_ROW_COLORS[region.row]);
      const middle=region.column===1;
      const clip=id+'-region-'+region.row+'-'+region.column;
      const merged=region.column===1&&region.lastRow>region.row;
      const matte=section.textureLayers.matte,sandy=section.textureLayers.sandy,glossy=section.textureLayers.glossy;
      const spansImage=appearance.imageMode==='span';
      const imageId=spansImage?appearance.spanningImageId:section.imageId;
      const image=appearance.images[imageId];
      const textRotation=region.column===0?-90:region.column===2?90:0;
      return <g key={clip} pointerEvents="none">
        <defs><clipPath id={clip}><rect x={x+2} y={y+2} width={w-4} height={h-4} rx="6"/></clipPath></defs>
        <rect x={x} y={y} width={w} height={h} rx="8" fill="#00050a"
          stroke={middle?accent:'#253d36'}
          strokeOpacity={middle?(merged?.7:.3):.32} strokeWidth={merged?2:1}/>
        <rect x={x+2} y={y+2} width={w-4} height={h-4} rx="6"
          fill={middle?accent:'#253d36'} fillOpacity={middle?(merged?.13:.055):.025}/>
        <g clipPath={'url(#'+clip+')'}>
          {image&&<image href={image}
            x={spansImage?0:x+2} y={spansImage?0:y+2}
            width={spansImage?TCG_MAT_WIDTH:w-4}
            height={spansImage?TCG_MAT_HEIGHT:h-4}
            preserveAspectRatio="xMidYMid slice"/>}
          {matte.enabled&&<rect x={x+4} y={y+4} width={w-8} height={h-8}
            fill={'url(#'+id+'-matte)'} opacity={matte.opacity*.32}/>}
          {sandy.enabled&&<rect x={x+4} y={y+4} width={w-8} height={h-8}
            fill={'url(#'+id+'-sandy)'} opacity={sandy.opacity*.6}/>}
          {glossy.enabled&&<>
            <rect x={x+5} y={y+5} width={w-10} height={Math.max(9,h*.21)} rx="5"
              fill="white" fillOpacity={glossy.opacity*.20}/>
            <line x1={x+8} x2={x+w-8} y1={y+Math.max(9,h*.21)+6} y2={y+Math.max(9,h*.21)+6}
              stroke="#d2e9df" strokeOpacity={glossy.opacity*.5}/>
            <line x1={x+8} x2={x+w-8} y1={y+h-8} y2={y+h-8}
              stroke="#051910" strokeOpacity={glossy.opacity*.28} strokeWidth="3"/>
          </>}
          {middle&&<rect x={x+5} y={y+5} width={w-10} height={h-10}
            fill={'url(#'+id+'-grid)'} opacity={merged?.4:.13}/>}
        </g>
        {section.innerShadow&&<>
          <rect x={x+3} y={y+3} width={w-6} height={h-6} rx="5"
            fill="none" stroke="black" strokeOpacity={section.shadowOpacity*.7} strokeWidth="5"/>
          <path d={'M'+(x+6)+' '+(y+7)+' H'+(x+w-6)+' M'+(x+7)+' '+(y+7)+' V'+(y+h-7)}
            fill="none" stroke="black" strokeOpacity={section.shadowOpacity*.7} strokeWidth="4"/>
        </>}
        {section.innerBevel&&<>
          <rect x={x+2.5} y={y+2.5} width={w-5} height={h-5} rx="6"
            stroke="#f4ebd2" fill="none" strokeOpacity={section.bevelOpacity*.3}/>
          <path d={'M'+(x+5)+' '+(y+h-4)+' H'+(x+w-5)+' M'+(x+w-4)+' '+(y+5)+' V'+(y+h-5)}
            stroke="#020c08" fill="none" strokeWidth="2" strokeOpacity={section.bevelOpacity*.75}/>
        </>}
        {section.outerBevel&&<>
          <rect x={x-1} y={y-1} width={w+2} height={h+2} rx="8"
            stroke={middle?'#d7cbac':'#36554b'} fill="none" strokeWidth="2.2"
            strokeOpacity={section.bevelOpacity*.68}/>
          <rect x={x-2} y={y-2} width={w+4} height={h+4} rx="9"
            stroke="black" fill="none" strokeWidth="1.8" strokeOpacity={section.bevelOpacity*.36}/>
        </>}
        <text x={x+w/2} y={y+h/2} transform={textRotation?'rotate('+textRotation+' '+(x+w/2)+' '+(y+h/2)+')':undefined}
          textAnchor="middle" dominantBaseline="central" fontFamily="Orbitron, Inter, sans-serif"
          fontWeight="bold" fontSize={region.column!==1?8:merged?12:10}
          fill={accent} opacity={merged?1:.6}>{tcgRegionLabel(region.row,region.column,region.lastRow)}</text>
      </g>;
    })}
    {cells.map(cell=>{
      const index=playmatSectionIndex(cell.row,cell.column);
      const local=tcgMatLocal(cell.x,cell.y,seat);
      const x=local.x+TCG_MAT_WIDTH/2-cell.width/2;
      const y=local.y+TCG_MAT_HEIGHT/2-cell.height/2;
      const chosen=appearance.selectedSections.includes(index);
      return <g key={index} className={'mat-preview-hit'+(chosen?' chosen':'')}
        role="button" tabIndex={0} aria-pressed={chosen}
        aria-label={'Row '+(cell.row+1)+', '+(['Left','Middle','Right'][cell.column])+' Section'}
        onClick={()=>onToggle(index)}
        onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onToggle(index);}}}>
        <rect x={x} y={y} width={cell.width} height={cell.height} rx="6"
          strokeWidth={chosen?2:1.5} fill="transparent"/>
        {chosen&&<circle cx={x+cell.width-7} cy={y+8} r="3" fill="#f7cf7d" pointerEvents="none"/>}
      </g>;
    })}
  </svg>;
}

export default function PlaymatEditor({appearance,setAppearance,merges,seat,inform}:Props){
  const [url,setUrl]=useState('');
  const [busy,setBusy]=useState(false);
  const selected=appearance.selectedSections;
  const sample=appearance.sections[selected[0]??0];
  const canEdit=selected.length>0;
  const canApplyImage=appearance.imageMode==='span'||canEdit;
  const anySectionImage=selected.some(index=>Boolean(appearance.sections[index].imageId));
  const currentImage=appearance.imageMode==='span'
    ?Boolean(appearance.spanningImageId):anySectionImage;
  const toggleSection=(index:number)=>{
    setAppearance(prev=>({...prev,selectedSections:prev.selectedSections.includes(index)
      ?prev.selectedSections.filter(n=>n!==index)
      :[...prev.selectedSections,index].sort((a,b)=>a-b)}));
  };
  const edit=(patch:Partial<PlaymatSectionStyle>)=>{
    setAppearance(prev=>({...prev,sections:prev.sections.map((style,i)=>
      prev.selectedSections.includes(i)?{...style,...patch}:style)}));
  };
  const editTexture=(key:PlaymatTextureKind,patch:{enabled?:boolean;opacity?:number})=>{
    setAppearance(prev=>({...prev,sections:prev.sections.map((style,i)=>
      prev.selectedSections.includes(i)?{
        ...style,
        textureLayers:{...style.textureLayers,[key]:{...style.textureLayers[key],...patch}}
      }:style)}));
  };
  const setImageMode=(mode:'repeat'|'span')=>{
    setAppearance(prev=>{
      if(prev.imageMode===mode)return prev;
      if(mode==='span'){
        // Reuse the active repeat image so switching modes shows an immediate
        // result instead of going blank. Per-section images stay preserved.
        const firstImage=prev.spanningImageId||
          prev.selectedSections.map(i=>prev.sections[i].imageId).find(Boolean)||
          prev.sections.map(section=>section.imageId).find(Boolean)||'';
        return {...prev,imageMode:mode,spanningImageId:firstImage};
      }
      // Retain custom per-section images. If none exist yet, start by
      // repeating the spanning image on each of the twelve sections.
      const anyRepeat=prev.sections.some(section=>Boolean(section.imageId));
      return {...prev,imageMode:mode,sections:!anyRepeat&&prev.spanningImageId
        ?prev.sections.map(section=>({...section,imageId:prev.spanningImageId}))
        :prev.sections};
    });
  };
  const applyImage=(source:string)=>{
    const image=source.trim();
    if(!canApplyImage){inform('Select At Least One Section.');return;}
    if(!/^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(image)){
      inform('Use a PNG, JPEG or WebP Image, or a Direct HTTPS Image URL.');return;
    }
    if(image.length>2000000){inform('Image Is Too Large for Local Storage.');return;}
    setAppearance(prev=>{
      const id='bg_'+Math.random().toString(36).slice(2,15);
      const spanningImageId=prev.imageMode==='span'?id:prev.spanningImageId;
      const sections=prev.imageMode==='repeat'
        ?prev.sections.map((style,i)=>prev.selectedSections.includes(i)?{...style,imageId:id}:style)
        :prev.sections;
      // The spanning image and old repeat configurations are independent.
      const wanted=new Set([...sections.map(style=>style.imageId),spanningImageId]);
      const images=Object.fromEntries(Object.entries({...prev.images,[id]:image}).filter(([key])=>wanted.has(key)));
      return {...prev,sections,spanningImageId,images};
    });
  };
  const removeImage=()=>{
    setAppearance(prev=>{
      const spanningImageId=prev.imageMode==='span'?'':prev.spanningImageId;
      const sections=prev.imageMode==='repeat'
        ?prev.sections.map((style,i)=>prev.selectedSections.includes(i)?{...style,imageId:''}:style)
        :prev.sections;
      const wanted=new Set([...sections.map(style=>style.imageId),spanningImageId]);
      return {...prev,sections,spanningImageId,
        images:Object.fromEntries(Object.entries(prev.images).filter(([key])=>wanted.has(key)))};
    });
  };
  const upload=async(file:File|undefined)=>{
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){
      inform('Upload a PNG, JPEG or WebP Image.');return;
    }
    setBusy(true);
    const blob=URL.createObjectURL(file);
    try{
      const img=new Image();
      await new Promise<void>((resolve,reject)=>{
        img.onload=()=>resolve();img.onerror=()=>reject(new Error('Unable To Read Image.'));
        img.src=blob;
      });
      const ratio=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
      const context=canvas.getContext('2d');
      if(!context)throw Error('Canvas Unavailable.');
      context.drawImage(img,0,0,canvas.width,canvas.height);
      applyImage(canvas.toDataURL('image/jpeg',.76));
    }catch(e){inform(e instanceof Error?e.message:String(e));}
    finally{URL.revokeObjectURL(blob);setBusy(false);}
  };
  return <div className="playmat-editor">
    <div className="mat-editor-heading">
      <div><h2>Playmat Settings</h2><p>Your Mat Only · Saved To Your Player Identity · Not Shared With Opponents</p></div>
      <button className="mat-mini-button" onClick={()=>setAppearance(defaultPlaymatAppearance())}>Reset All</button>
    </div>
    <div className="mat-editor-layout">
      <section className="mat-editor-pane mat-preview-pane" aria-label="Live Playmat">
        <div className="mat-pane-bar">
          <h3>Live Playmat</h3>
          <span>{selected.length} / 12 Selected</span>
          <button onClick={()=>setAppearance(prev=>({...prev,selectedSections:Array.from({length:12},(_,i)=>i)}))}>All</button>
          <button onClick={()=>setAppearance(prev=>({...prev,selectedSections:[]}))}>None</button>
        </div>
        <LiveMatPreview appearance={appearance} merges={merges} seat={seat} onToggle={toggleSection}/>
        <div className="mat-pane-bar mat-preview-hint">Click Sections To Customize · Preview Updates Instantly</div>
        <div className="mat-inline-image">
          <h3>Background Image</h3>
          <div className="mat-image-modes" role="group" aria-label="Background Image Layout">
            <button type="button" aria-pressed={appearance.imageMode==='repeat'}
              className={appearance.imageMode==='repeat'?'selected':''}
              onClick={()=>setImageMode('repeat')}>Repeat Per Section</button>
            <button type="button" aria-pressed={appearance.imageMode==='span'}
              className={appearance.imageMode==='span'?'selected':''}
              onClick={()=>setImageMode('span')}>Span Entire Playmat</button>
          </div>
          <div className="mat-input-row">
            <input value={url} type="url" placeholder="Image URL" aria-label="Background Image URL"
              onChange={e=>setUrl(e.target.value)}/>
            <button disabled={!canApplyImage||!url.trim()} onClick={()=>applyImage(url)}>Apply</button>
          </div>
          <div className="mat-input-row">
            <label className="mat-upload-control">
              {busy?'Processing…':'Upload Image'}
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!canApplyImage||busy}
                onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/>
            </label>
            <button disabled={!currentImage} onClick={removeImage}>Remove Image</button>
          </div>
          <span className="mat-image-hint">{appearance.imageMode==='span'
            ?'One Continuous Image Across All 12 Sections'
            :'Repeat The Image Within Each Selected Section'} · Textures &amp; Effects Always On Top</span>
        </div>
      </section>
      <div className="mat-editor-controls">
        <section className="mat-editor-pane">
          <div className="mat-pane-bar"><h3>Textures</h3><span>Independent Layers</span></div>
          {textureKinds.map(key=>{
            const layer=sample.textureLayers[key];
            return <div className="mat-compact-control" key={key}>
              <label className="mat-compact-check">
                <input type="checkbox" disabled={!canEdit} checked={layer.enabled}
                  onChange={e=>editTexture(key,{enabled:e.target.checked})}/>
                {textureTitles[key]}
              </label>
              <label className="mat-compact-opacity">
                <span>Opacity {Math.round(layer.opacity*100)}%</span>
                <input type="range" min="0" max="1" step=".01" value={layer.opacity}
                  disabled={!canEdit||!layer.enabled}
                  onChange={e=>editTexture(key,{opacity:Number(e.target.value)})}/>
              </label>
            </div>;
          })}
        </section>
        <section className="mat-editor-pane">
          <div className="mat-pane-bar"><h3>Depth &amp; Bevels</h3></div>
          <div className="mat-compact-control">
            <label className="mat-compact-check">
              <input type="checkbox" checked={sample.innerShadow} disabled={!canEdit}
                onChange={e=>edit({innerShadow:e.target.checked})}/> Inner Shadow
            </label>
            <label className="mat-compact-opacity">
              <span>Opacity {Math.round(sample.shadowOpacity*100)}%</span>
              <input type="range" min="0" max="1" step=".01" value={sample.shadowOpacity}
                disabled={!canEdit||!sample.innerShadow}
                onChange={e=>edit({shadowOpacity:Number(e.target.value)})}/>
            </label>
          </div>
          <label className="mat-compact-check mat-compact-single">
            <input type="checkbox" checked={sample.innerBevel} disabled={!canEdit}
              onChange={e=>edit({innerBevel:e.target.checked})}/> Inner Bevel
          </label>
          <div className="mat-compact-control">
            <label className="mat-compact-check">
              <input type="checkbox" checked={sample.outerBevel} disabled={!canEdit}
                onChange={e=>edit({outerBevel:e.target.checked})}/> Outer Bevel
            </label>
            <label className="mat-compact-opacity">
              <span>Bevel Opacity {Math.round(sample.bevelOpacity*100)}%</span>
              <input type="range" min="0" max="1" step=".01" value={sample.bevelOpacity}
                disabled={!canEdit||(!sample.innerBevel&&!sample.outerBevel)}
                onChange={e=>edit({bevelOpacity:Number(e.target.value)})}/>
            </label>
          </div>
        </section>
        <section className="mat-editor-pane mat-editor-snapping">
          <label className="mat-compact-check">
            <input type="checkbox" checked={appearance.snapMerged}
              onChange={e=>setAppearance(prev=>({...prev,snapMerged:e.target.checked}))}/>
            Snap Merged Sections
          </label>
          <span>Off By Default · Unmerged Spaces Always Snap</span>
        </section>
      </div>
    </div>
  </div>;
}
