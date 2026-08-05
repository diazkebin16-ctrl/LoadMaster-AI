"use strict";

// ===== engine/geometry.js =====
const EPS = 1e-7;
const roundQuarter = n => Math.round(n * 4) / 4;

class Geometry {
  static clone(v) { return JSON.parse(JSON.stringify(v)); }
  static normalize(s) { return {...s, x:roundQuarter(Number(s.x)||0), y:roundQuarter(Number(s.y)||0), w:Number(s.w), l:Number(s.l)}; }
  static overlaps(a,b) {
    return a.x < b.x+b.w-EPS && a.x+a.w > b.x+EPS && a.y < b.y+b.l-EPS && a.y+a.l > b.y+EPS;
  }
  static inside(s,t) {
    return Number.isFinite(s.x)&&Number.isFinite(s.y)&&Number.isFinite(s.w)&&Number.isFinite(s.l)&&s.w>0&&s.l>0&&s.x>=-EPS&&s.y>=-EPS&&s.x+s.w<=t.width+EPS&&s.y+s.l<=t.length+EPS;
  }
  static valid(s,placed,t,ignoreId=null) { return Geometry.inside(s,t)&&!placed.some(o=>o.id!==ignoreId&&Geometry.overlaps(s,o)); }
  static usedLength(stacks) { return stacks.length?Math.max(...stacks.map(s=>s.y+s.l)):0; }
  static floorArea(stacks) { return stacks.reduce((a,s)=>a+s.w*s.l,0); }
  static contactScore(s,others,t) {
    let score=0;
    if(Math.abs(s.x)<EPS||Math.abs(s.x+s.w-t.width)<EPS) score+=s.l;
    if(Math.abs(s.y)<EPS) score+=s.w;
    for(const o of others){
      const vo=Math.max(0,Math.min(s.y+s.l,o.y+o.l)-Math.max(s.y,o.y));
      const ho=Math.max(0,Math.min(s.x+s.w,o.x+o.w)-Math.max(s.x,o.x));
      if(Math.abs(s.x+s.w-o.x)<EPS||Math.abs(o.x+o.w-s.x)<EPS)score+=vo;
      if(Math.abs(s.y+s.l-o.y)<EPS||Math.abs(o.y+o.l-s.y)<EPS)score+=ho;
    }
    return score;
  }
  static axes(shape,placed,t) {
    const xs=new Set([0,roundQuarter(t.width-shape.w)]), ys=new Set([0]);
    for(const o of placed){
      [o.x,o.x+o.w,o.x-shape.w,o.x+o.w-shape.w].forEach(v=>xs.add(roundQuarter(v)));
      [o.y,o.y+o.l,o.y-shape.l,o.y+o.l-shape.l].forEach(v=>ys.add(roundQuarter(v)));
    }
    return {xs:[...xs].filter(x=>x>=-EPS&&x+shape.w<=t.width+EPS).sort((a,b)=>a-b),ys:[...ys].filter(y=>y>=-EPS&&y+shape.l<=t.length+EPS).sort((a,b)=>a-b)};
  }
  static candidateAxes(shape,placed,t) { return Geometry.axes(shape,placed,t); }
  static candidates(shape,placed,t) {
    const {xs,ys}=Geometry.axes(shape,placed,t), out=[];
    for(const y of ys)for(const x of xs){const c={...shape,x,y};if(Geometry.valid(c,placed,t))out.push(c);}
    return out.sort((a,b)=>(a.y+a.l)-(b.y+b.l)||a.y-b.y||a.x-b.x);
  }
}

// ===== engine/validator.js =====
function validateLayout(stacks,trailer){
  const errors=[];
  if(!trailer||!(trailer.width>0)||!(trailer.length>0))errors.push({type:'trailer',message:'Dimensiones del tráiler inválidas'});
  const ids=new Set();
  stacks.forEach((s,i)=>{
    if(!s.id||ids.has(s.id))errors.push({type:'id',index:i,message:'ID repetido o ausente'}); ids.add(s.id);
    if(!Geometry.inside(s,trailer))errors.push({type:'outside',id:s.id,name:s.name,message:`${s.name||'Pila'} está fuera del tráiler`});
    for(let j=0;j<i;j++)if(Geometry.overlaps(s,stacks[j]))errors.push({type:'overlap',id:s.id,otherId:stacks[j].id,message:`${s.name||'Pila'} se superpone con ${stacks[j].name||'otra pila'}`});
  });
  return {ok:errors.length===0,errors};
}
function explainValidation(v){return v.ok?'Carga válida':v.errors.slice(0,3).map(e=>e.message).join(' · ');}

// ===== engine/scoring.js =====
function layoutScore(stacks,trailer,originals=[]){
  const used=Geometry.usedLength(stacks), area=Geometry.floorArea(stacks), waste=Math.max(0,trailer.width*used-area);
  let contacts=0;
  for(let i=0;i<stacks.length;i++){
    const s=stacks[i];
    if(Math.abs(s.x)<EPS||Math.abs(s.x+s.w-trailer.width)<EPS)contacts+=s.l;
    if(Math.abs(s.y)<EPS)contacts+=s.w;
    for(let j=i+1;j<stacks.length;j++){
      const o=stacks[j];
      const vertical=Math.max(0,Math.min(s.y+s.l,o.y+o.l)-Math.max(s.y,o.y));
      const horizontal=Math.max(0,Math.min(s.x+s.w,o.x+o.w)-Math.max(s.x,o.x));
      if(Math.abs(s.x+s.w-o.x)<EPS||Math.abs(o.x+o.w-s.x)<EPS)contacts+=vertical*2;
      if(Math.abs(s.y+s.l-o.y)<EPS||Math.abs(o.y+o.l-s.y)<EPS)contacts+=horizontal*2;
    }
  }
  const map=new Map(originals.map(s=>[s.id,s])); let movement=0;
  for(const s of stacks){const o=map.get(s.id);if(o)movement+=Math.abs(s.x-o.x)+Math.abs(s.y-o.y)+(s.w!==o.w||s.l!==o.l?10:0);}
  return used*1e9+waste*1e4-contacts*100+movement;
}

// ===== engine/refine.js =====
function refineLayout(input,trailer,passes=20){
  let stacks=Geometry.clone(input), changed=true, pass=0;
  while(changed&&pass++<passes){
    changed=false;
    const ids=stacks.filter(s=>!s.locked).sort((a,b)=>(a.y+a.l)-(b.y+b.l)||a.x-b.x).map(s=>s.id);
    for(const id of ids){
      const idx=stacks.findIndex(s=>s.id===id), s=stacks[idx], others=stacks.filter(o=>o.id!==id);
      const axes=Geometry.axes(s,others,trailer), candidates=[s];
      for(const x of axes.xs){const c={...s,x};if(Geometry.valid(c,others,trailer))candidates.push(c);}
      for(const y of axes.ys){const c={...s,y};if(Geometry.valid(c,others,trailer))candidates.push(c);}
      for(const c of Geometry.candidates(s,others,trailer))candidates.push(c);
      let best=s,bestScore=layoutScore([...others,s],trailer,input);
      for(const c of candidates){const score=layoutScore([...others,c],trailer,input);if(score<bestScore-EPS){best=c;bestScore=score;}}
      if(best.x!==s.x||best.y!==s.y){stacks[idx]=best;changed=true;}
    }
  }
  return stacks;
}

// ===== engine/optimizer.js =====
const isFourWay = s => String(s.type || '').toLowerCase().replace(/[^a-z0-9]/g, '') === '4way';
const samePose = (a,b) => Math.abs(a.x-b.x)<EPS && Math.abs(a.y-b.y)<EPS && Math.abs(a.w-b.w)<EPS && Math.abs(a.l-b.l)<EPS;

function solutionDistance(a,b,trailer){
  const amap=new Map((a.stacks||[]).map(s=>[s.id,s]));
  const bmap=new Map((b.stacks||[]).map(s=>[s.id,s]));
  const ids=new Set([...amap.keys(),...bmap.keys()]);
  let total=0,count=0;
  for(const id of ids){
    const x=amap.get(id),y=bmap.get(id);count++;
    if(!x||!y){total+=1;continue;}
    const center=Math.hypot(((x.x+x.w/2)-(y.x+y.w/2))/Math.max(1,trailer.width),((x.y+x.l/2)-(y.y+y.l/2))/Math.max(1,trailer.length));
    const rotated=(Math.abs(x.w-y.w)>EPS||Math.abs(x.l-y.l)>EPS)?0.18:0;
    total+=Math.min(1,center*3+rotated);
  }
  const au=new Set((a.unplaced||[]).map(s=>s.id)),bu=new Set((b.unplaced||[]).map(s=>s.id));
  const union=new Set([...au,...bu]);
  const missingDiff=[...union].filter(id=>au.has(id)!==bu.has(id)).length/Math.max(1,union.size);
  return (count?total/count:0)*0.8+missingDiff*0.2;
}

function selectDiverseSolutions(sorted,limit,trailer){
  if(!sorted.length)return [];
  const selected=[sorted[0]],remaining=sorted.slice(1);
  while(selected.length<limit&&remaining.length){
    let bestIndex=0,bestValue=-Infinity;
    for(let i=0;i<remaining.length;i++){
      const candidate=remaining[i];
      const qualityGap=(sorted[0].loadedPallets-candidate.loadedPallets)*4+(sorted[0].loadedStacks-candidate.loadedStacks)*2;
      const minDistance=Math.min(...selected.map(s=>solutionDistance(candidate,s,trailer)));
      const familyBonus=selected.some(s=>s.family&&candidate.family&&s.family===candidate.family)?0:0.25;
      const value=minDistance*10+familyBonus-qualityGap;
      if(value>bestValue){bestValue=value;bestIndex=i;}
    }
    selected.push(remaining.splice(bestIndex,1)[0]);
  }
  return selected;
}

class LoadEngine {
  constructor(trailer,{timeLimitMs=9000,patterns=[],strategies=[],seedOffset=0,profile='balanced'}={}){
    this.trailer=Geometry.clone(trailer);
    this.patterns=Array.isArray(patterns)?Geometry.clone(patterns):[];
    this.strategies=Array.isArray(strategies)?Geometry.clone(strategies):[];
    this.seedOffset=Number(seedOffset)||0;
    this.profile=String(profile||'balanced');
    this.deadline=Date.now()+timeLimitMs;
    this.timedOut=false;
  }
  hasTime(){if(Date.now()<this.deadline)return true;this.timedOut=true;return false;}

  orientations(s){
    const normal={...s};
    const out=[normal];
    if(isFourWay(s) && s.canRotate!==false && Math.abs(s.w-s.l)>EPS){
      out.push({...s,w:s.l,l:s.w,rotated:!s.rotated});
    }
    return out;
  }

  metrics(stacks,originals){
    return {
      score:layoutScore(stacks,this.trailer,originals),
      used:Geometry.usedLength(stacks),
      efficiency:Geometry.floorArea(stacks)/Math.max(1,this.trailer.width*Geometry.usedLength(stacks))*100,
      moved:stacks.filter(s=>{const o=originals.find(x=>x.id===s.id);return o&&!samePose(o,s);}).length,
      rotated:stacks.filter(s=>{const o=originals.find(x=>x.id===s.id);return o&&(Math.abs(o.w-s.w)>EPS||Math.abs(o.l-s.l)>EPS);}).length
    };
  }

  compact(input){
    const locked=input.filter(s=>s.locked);
    const lockedCheck=validateLayout(locked,this.trailer);
    if(!lockedCheck.ok)return {ok:false,message:`Pilas bloqueadas inválidas: ${explainValidation(lockedCheck)}`};
    const refined=this.sequenceRefine(input,input,8);
    const check=validateLayout(refined,this.trailer);
    return check.ok?{ok:true,stacks:refined}:{ok:false,message:`Compactación rechazada: ${explainValidation(check)}`};
  }

  orders(movable){
    const variants=[
      [...movable].sort((a,b)=>b.w*b.l-a.w*a.l),
      [...movable].sort((a,b)=>Math.max(b.w,b.l)-Math.max(a.w,a.l)||b.w*b.l-a.w*a.l),
      [...movable].sort((a,b)=>b.l-a.l||b.w-a.w),
      [...movable].sort((a,b)=>b.w-a.w||b.l-a.l),
      [...movable].sort((a,b)=>a.y-b.y||a.x-b.x),
      [...movable].sort((a,b)=>(isFourWay(b)?1:0)-(isFourWay(a)?1:0)||b.w*b.l-a.w*a.l)
    ];
    let seed=(2166136261 ^ ((this.seedOffset+1)*2654435761))>>>0;
    for(const s of movable)for(const ch of String(s.id))seed=(seed^ch.charCodeAt(0))*16777619>>>0;
    const rnd=()=>((seed=1664525*seed+1013904223>>>0)/4294967296);
    const randomOrders=movable.length>28?2:movable.length>18?4:8;
    for(let k=0;k<randomOrders;k++){
      const a=[...movable];
      for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
      variants.push(a);
    }
    return [...this.strategyOrders(movable),...this.rowCombinationOrders(movable),...variants];
  }

  familyOrders(movable){
    const original=[...movable];
    const groups=[
      {family:'Conservadora',name:'Conservadora · grandes primero',orders:[[...original].sort((a,b)=>b.w*b.l-a.w*a.l||b.l-a.l),[...original].sort((a,b)=>Math.max(b.w,b.l)-Math.max(a.w,a.l)||b.w*b.l-a.w*a.l)]},
      {family:'Compacta',name:'Compacta · pequeñas y huecos primero',orders:[[...original].sort((a,b)=>a.w*a.l-b.w*b.l||a.l-b.l),[...original].sort((a,b)=>Math.min(a.w,a.l)-Math.min(b.w,b.l)||a.w*a.l-b.w*b.l)]},
      {family:'Filas',name:'Filas · combinaciones de ancho',orders:[...this.rowCombinationOrders(original).slice(0,8),[...original].sort((a,b)=>b.w-a.w||a.l-b.l)]},
      {family:'Reinicio',name:'Reinicio total · orden inverso y mezclado',orders:[[...original].sort((a,b)=>b.l-a.l||a.w-b.w),[...original].sort((a,b)=>a.l-b.l||b.w-a.w),[...original].reverse()]}
    ];
    const preferred={large:'Conservadora',small:'Compacta',rows:'Filas',restart:'Reinicio'}[this.profile];
    if(!preferred)return groups;
    return [...groups.filter(g=>g.family===preferred),...groups.filter(g=>g.family!==preferred)];
  }

  structuralProfiles(movable){
    const area=s=>s.w*s.l;
    const small=s=>Math.min(s.w,s.l)<=28.5;
    const medium=s=>!small(s)&&Math.min(s.w,s.l)<40;
    const large=s=>Math.min(s.w,s.l)>=40;
    const groups={small:movable.filter(small),medium:movable.filter(medium),large:movable.filter(large)};
    const byAreaDesc=a=>[...a].sort((x,y)=>area(y)-area(x)||y.l-x.l);
    const byAreaAsc=a=>[...a].sort((x,y)=>area(x)-area(y)||x.l-y.l);
    const interleave=(a,b,c)=>{const out=[];const lists=[a,b,c].map(x=>[...x]);let i=0;while(lists.some(x=>x.length)){const list=lists[i++%lists.length];if(list.length)out.push(list.shift());}return out;};
    return [
      {name:'Estructura V2 · grandes→medianas→pequeñas',family:'Estructura global',mode:'dense',order:[...byAreaDesc(groups.large),...byAreaDesc(groups.medium),...byAreaDesc(groups.small)]},
      {name:'Estructura V2 · pequeñas en extremos',family:'Estructura global',mode:'fill',order:[...byAreaAsc(groups.small),...byAreaDesc(groups.large),...byAreaDesc(groups.medium)]},
      {name:'Estructura V2 · bloques intercalados',family:'Estructura global',mode:'balanced',order:interleave(byAreaDesc(groups.large),byAreaDesc(groups.medium),byAreaAsc(groups.small))},
      {name:'Estructura V2 · medianas como puente',family:'Estructura global',mode:'bridge',order:[...byAreaDesc(groups.medium),...byAreaDesc(groups.large),...byAreaAsc(groups.small)]},
      {name:'Estructura V2 · inversión completa',family:'Estructura global',mode:'reverse',order:[...byAreaAsc(movable)].reverse()}
    ];
  }

  structuralRowPack(order,locked,originals,mode='balanced'){
    // Motor V2: decide primero la estructura de cada fila y luego coloca sus piezas.
    // No conserva el esqueleto de una solución previa.
    if(locked.length)return null;
    const remaining=order.map(Geometry.clone), placed=[];
    let y=0, guard=0;
    const maxPerRow=4;
    while(remaining.length&&this.hasTime()&&guard++<originals.length+8){
      const pool=remaining.slice(0,Math.min(16,remaining.length));
      const combos=[];
      const dfs=(chosen,usedWidth,depth,start)=>{
        if(chosen.length){
          const qty=chosen.reduce((n,o)=>n+(Number(o.qty)||1),0);
          const widthGap=this.trailer.width-usedWidth;
          const rowDepth=Math.max(...chosen.map(o=>o.l));
          const area=chosen.reduce((n,o)=>n+o.w*o.l,0);
          const depthPenalty=mode==='fill'?rowDepth*0.35:mode==='dense'?rowDepth*0.15:rowDepth*0.25;
          const smallBonus=mode==='fill'?chosen.filter(o=>Math.min(o.w,o.l)<=28.5).length*12:0;
          const bridgeBonus=mode==='bridge'?chosen.filter(o=>Math.min(o.w,o.l)>28.5&&Math.min(o.w,o.l)<40).length*10:0;
          combos.push({chosen:[...chosen],score:qty*100+area/15-widthGap*5-depthPenalty+smallBonus+bridgeBonus,rowDepth});
        }
        if(chosen.length>=maxPerRow)return;
        for(let i=start;i<pool.length;i++){
          const s=pool[i];
          const poses=(mode==='reverse'||mode==='bridge')?this.orientations(s):[{...s}];
          for(const o of poses){
            if(usedWidth+o.w>this.trailer.width+EPS)continue;
            dfs([...chosen,o],usedWidth+o.w,Math.max(depth,o.l),i+1);
          }
        }
      };
      dfs([],0,0,0);
      combos.sort((a,b)=>b.score-a.score||a.rowDepth-b.rowDepth);
      let selected=null;
      for(const combo of combos.slice(0,80)){
        if(y+combo.rowDepth>this.trailer.length+EPS)continue;
        let x=0;const row=[];let ok=true;
        for(const o of combo.chosen){const c={...o,x,y};if(!Geometry.valid(c,[...placed,...row],this.trailer)){ok=false;break;}row.push(c);x+=o.w;}
        if(ok){selected={row,ids:new Set(combo.chosen.map(o=>o.id)),depth:combo.rowDepth};break;}
      }
      if(!selected)break;
      placed.push(...selected.row);
      for(let i=remaining.length-1;i>=0;i--)if(selected.ids.has(remaining[i].id))remaining.splice(i,1);
      y+=selected.depth;
    }
    if(!placed.length)return null;
    // Intenta llenar huecos globales con las piezas restantes sin alterar la estructura base.
    const leftovers=[];
    for(const s of remaining){
      const options=this.placementOptions(s,placed,80);
      if(options.length)placed.push(options[0]);else leftovers.push(s);
    }
    if(!validateLayout(placed,this.trailer).ok)return null;
    return {stacks:placed,unplaced:leftovers};
  }

  strategyOrders(movable){
    const results=[];
    for(const strategy of this.strategies.slice(-40).reverse()){
      if(!strategy||!Array.isArray(strategy.sequence))continue;
      const available=[...movable],order=[];
      for(const wanted of strategy.sequence){
        const i=available.findIndex(s=>Math.abs(s.w-wanted.w)<EPS&&Math.abs(s.l-wanted.l)<EPS&&String(s.type||'')===String(wanted.type||''));
        const r=available.findIndex(s=>isFourWay(s)&&s.canRotate!==false&&Math.abs(s.w-wanted.l)<EPS&&Math.abs(s.l-wanted.w)<EPS&&String(s.type||'')===String(wanted.type||''));
        const idx=i>=0?i:r;
        if(idx>=0)order.push(available.splice(idx,1)[0]);
      }
      if(order.length>=2)results.push([...order,...available]);
      if(results.length>=12)break;
    }
    return results;
  }

  rowCombinationOrders(movable){
    const results=[];
    // Limita la búsqueda combinatoria a representantes de medidas; evita n^4 con cargas grandes.
    const representatives=[];const perShape=new Map();
    for(const s of movable){const key=[s.w,s.l,s.type,s.canRotate!==false].join('|');const n=perShape.get(key)||0;if(n<4){representatives.push(s);perShape.set(key,n+1);}if(representatives.length>=18)break;}
    const poses=s=>this.orientations(s).map(o=>({id:s.id,w:o.w,l:o.l}));
    const maxItems=Math.min(4,representatives.length);let explored=0;
    const search=(row,usedWidth)=>{
      if(!this.hasTime()||explored++>6000)return;
      if(row.length>=2){
        const ids=new Set(row.map(r=>r.id));const chosen=row.map(r=>movable.find(s=>s.id===r.id));
        results.push([...chosen,...movable.filter(s=>!ids.has(s.id))]);
      }
      if(row.length>=maxItems)return;
      for(const s of representatives){
        if(row.some(r=>r.id===s.id))continue;
        for(const o of poses(s))if(usedWidth+o.w<=this.trailer.width+EPS)search([...row,o],usedWidth+o.w);
      }
    };
    search([],0);
    const scored=results.map(order=>{let bestGap=this.trailer.width;
      for(let take=2;take<=Math.min(4,order.length);take++){
        const subset=order.slice(0,take);const combos=[[]];
        for(const s of subset){const next=[];for(const c of combos)for(const o of this.orientations(s))next.push([...c,o]);combos.splice(0,combos.length,...next);}
        for(const c of combos){const width=c.reduce((n,o)=>n+o.w,0);if(width<=this.trailer.width+EPS)bestGap=Math.min(bestGap,this.trailer.width-width);}
      }
      return {order,gap:bestGap};
    }).sort((a,b)=>a.gap-b.gap);
    const unique=[],seen=new Set();for(const x of scored){const key=x.order.map(s=>s.id).join('|');if(seen.has(key))continue;seen.add(key);unique.push(x.order);if(unique.length>=18)break;}return unique;
  }

  placementOptions(original,placed,limit=48){
    const all=[];
    for(const shape of this.orientations(original)){
      const candidates=Geometry.candidates({...shape,x:0,y:0},placed,this.trailer);
      for(const c of candidates)all.push(c);
    }
    all.sort((a,b)=>{
      const au=Math.max(Geometry.usedLength(placed),a.y+a.l), bu=Math.max(Geometry.usedLength(placed),b.y+b.l);
      if(au!==bu)return au-bu;
      const ac=Geometry.contactScore(a,placed,this.trailer),bc=Geometry.contactScore(b,placed,this.trailer);
      return bc-ac||a.y-b.y||a.x-b.x;
    });
    const unique=[],seen=new Set();
    for(const c of all){
      const key=`${c.x},${c.y},${c.w},${c.l}`;
      if(seen.has(key))continue;
      seen.add(key);unique.push(c);
      if(unique.length>=limit)break;
    }
    return unique;
  }

  pack(order,locked,originals,beamWidth=120){
    let beams=[Geometry.clone(locked)];
    for(const original of order){
      if(!this.hasTime())return null;
      const next=[];
      for(const placed of beams){
        if(!this.hasTime())break;
        for(const c of this.placementOptions(original,placed,24))next.push([...placed,c]);
      }
      if(!next.length)return null;
      next.sort((a,b)=>layoutScore(a,this.trailer,originals)-layoutScore(b,this.trailer,originals));
      const unique=[],seen=new Set(),orientationQuota=new Map();
      for(const layout of next){
        const last=layout[layout.length-1];
        const orientationKey=`${last.w}x${last.l}`;
        const count=orientationQuota.get(orientationKey)||0;
        if(count>=Math.max(12,Math.floor(beamWidth/2)))continue;
        const key=layout.map(s=>`${s.id}:${s.x},${s.y},${s.w},${s.l}`).sort().join('|');
        if(seen.has(key))continue;
        seen.add(key);orientationQuota.set(orientationKey,count+1);unique.push(layout);
        if(unique.length>=beamWidth)break;
      }
      beams=unique;
    }
    if(!beams.length)return null;
    for(const beam of beams.slice(0,6)){
      if(!this.hasTime())break;
      const polished=this.sequenceRefine(beam,originals,3);
      if(validateLayout(polished,this.trailer).ok)return polished;
    }
    return null;
  }

  bestSingleMove(layout,id,originals,optionLimit=70){
    const current=layout.find(s=>s.id===id);
    if(!current||current.locked)return null;
    const others=layout.filter(s=>s.id!==id);
    const candidates=[current,...this.placementOptions(current,others,optionLimit)];
    let best=current,bestScore=layoutScore(layout,this.trailer,originals);
    for(const c of candidates){
      const candidate=[...others,c];
      if(!validateLayout(candidate,this.trailer).ok)continue;
      const score=layoutScore(candidate,this.trailer,originals);
      if(score<bestScore-EPS){best=c;bestScore=score;}
    }
    return samePose(best,current)?null:{piece:best,score:bestScore};
  }

  sequenceRefine(input,originals,passes=8){
    let layout=Geometry.clone(input);
    if(!validateLayout(layout,this.trailer).ok)return layout;
    for(let pass=0;pass<passes;pass++){
      if(!this.hasTime())break;
      let changed=false;
      const ids=layout.filter(s=>!s.locked).sort((a,b)=>(b.y+b.l)-(a.y+a.l)).map(s=>s.id);
      for(const id of ids){
        if(!this.hasTime())break;
        const move=this.bestSingleMove(layout,id,originals,40);
        if(move){layout=layout.map(s=>s.id===id?move.piece:s);changed=true;}
      }
      if(changed)continue;

      // Búsqueda de dos acciones: girar/mover una pila aunque la primera acción
      // no sea mejor por sí sola, para permitir que una segunda pila ocupe el hueco abierto.
      const baseScore=layoutScore(layout,this.trailer,originals);
      let bestLayout=null,bestScore=baseScore;
      const focus=layout.filter(s=>!s.locked).sort((a,b)=>(b.y+b.l)-(a.y+a.l)).slice(0,8);
      for(const first of focus){
        if(!this.hasTime())break;
        const withoutFirst=layout.filter(s=>s.id!==first.id);
        const firstOptions=this.placementOptions(first,withoutFirst,12);
        for(const p1 of firstOptions){
          const stage1=[...withoutFirst,p1];
          if(!validateLayout(stage1,this.trailer).ok)continue;
          const secondIds=stage1.filter(s=>!s.locked&&s.id!==first.id).sort((a,b)=>(b.y+b.l)-(a.y+a.l)).slice(0,6).map(s=>s.id);
          for(const secondId of secondIds){
            if(!this.hasTime())break;
            const second=this.bestSingleMove(stage1,secondId,originals,16);
            if(!second)continue;
            const stage2=stage1.map(s=>s.id===secondId?second.piece:s);
            const score=layoutScore(stage2,this.trailer,originals);
            if(score<bestScore-EPS){bestScore=score;bestLayout=stage2;}
          }
        }
      }
      if(bestLayout){layout=bestLayout;changed=true;}
      if(!changed)break;
    }
    const final=refineLayout(layout,this.trailer,8);
    return validateLayout(final,this.trailer).ok?final:layout;
  }

  repairLayout(input){
    // Conserva primero las pilas que ya están válidas dentro del tráiler.
    // Las que están fuera o en conflicto se vuelven a colocar una por una,
    // probando también la rotación permitida.
    const fixed=[];
    const pending=[];
    const ordered=[...input].sort((a,b)=>(a.locked?0:1)-(b.locked?0:1)||a.y-b.y||a.x-b.x);
    for(const s of ordered){
      if(Geometry.valid(s,fixed,this.trailer)) fixed.push(Geometry.clone(s));
      else pending.push(Geometry.clone(s));
    }
    if(!pending.length) return Geometry.clone(input);

    // Beam search progresivo: permite que una colocación intermedia no sea
    // la mejor visualmente, siempre que abra espacio para las siguientes.
    let beams=[fixed];
    const pendingOrders=this.orders(pending).slice(0,pending.length>18?3:5);
    const complete=[];
    for(const order of pendingOrders){
      if(!this.hasTime())break;
      beams=[Geometry.clone(fixed)];
      let failed=false;
      for(const piece of order){
        if(!this.hasTime()){failed=true;break;}
        const next=[];
        for(const placed of beams){
          if(!this.hasTime())break;
          const opts=this.placementOptions(piece,placed,36);
          for(const c of opts) next.push([...placed,c]);
        }
        if(!next.length){failed=true;break;}
        next.sort((a,b)=>layoutScore(a,this.trailer,input)-layoutScore(b,this.trailer,input));
        const unique=[],seen=new Set();
        for(const layout of next){
          const key=layout.map(x=>`${x.id}:${x.x},${x.y},${x.w},${x.l}`).sort().join('|');
          if(seen.has(key))continue;
          seen.add(key);unique.push(layout);
          if(unique.length>=80)break;
        }
        beams=unique;
      }
      if(!failed){
        for(const candidate of beams.slice(0,6)){
          if(!this.hasTime())break;
          const polished=this.sequenceRefine(candidate,input,4);
          if(validateLayout(polished,this.trailer).ok) complete.push(polished);
        }
      }
    }
    if(!complete.length) return null;
    complete.sort((a,b)=>layoutScore(a,this.trailer,input)-layoutScore(b,this.trailer,input));
    return complete[0];
  }


  destroyRepair(input,originals){
    const validBase=input.filter(s=>Geometry.valid(s,input.filter(x=>x.id!==s.id),this.trailer));
    const movable=input.filter(s=>!s.locked);
    const candidates=[];
    const destroySizes=[3,5,8,12,Math.min(18,movable.length)];
    const priorities=[
      [...movable].sort((a,b)=>(b.y+b.l)-(a.y+a.l)),
      [...movable].sort((a,b)=>b.w*b.l-a.w*a.l),
      [...movable].sort((a,b)=>a.y-b.y||a.x-b.x)
    ];
    for(const ranked of priorities){
      for(const size of destroySizes){
        if(!this.hasTime())return candidates;
        const removed=new Set(ranked.slice(0,size).map(s=>s.id));
        const base=input.filter(s=>s.locked||(!removed.has(s.id)&&Geometry.valid(s,input.filter(x=>x.id!==s.id&&!removed.has(x.id)),this.trailer)));
        const pending=input.filter(s=>!base.some(x=>x.id===s.id));
        for(const order of this.orders(pending).slice(0,size>=12?5:3)){
          if(!this.hasTime())return candidates;
          const partial=this.packPartial(order,base,originals,size>=12?220:170);
          if(partial&&validateLayout(partial.stacks,this.trailer).ok)candidates.push({name:`Reconstrucción de zona (${size})`,...partial});
        }
      }
    }
    return candidates;
  }


  lastMileRescue(placed,unplaced,originals){
    // Fase final dirigida: solo se activa cuando faltan de 1 a 3 pilas.
    // Parte de la mejor solución ya encontrada y nunca la reemplaza si no mejora.
    const missing=(unplaced||[]).map(Geometry.clone);
    if(!missing.length||missing.length>3)return [];
    const movable=placed.filter(s=>!s.locked);
    if(!movable.length)return [];
    const candidates=[];
    const used=Geometry.usedLength(placed);
    const maxMissingLength=Math.max(...missing.map(s=>Math.max(s.l,s.w)),1);
    const rankedEnd=[...movable].sort((a,b)=>(b.y+b.l)-(a.y+a.l));
    const rankedSmall=[...movable].sort((a,b)=>a.w*a.l-b.w*b.l||(b.y+b.l)-(a.y+a.l));
    const zoneDepths=[maxMissingLength*1.5,maxMissingLength*2.5,maxMissingLength*4];
    const removalSets=[];
    for(const n of [4,6,8,10,12,16,Math.min(22,movable.length)]){
      if(n>0)removalSets.push(rankedEnd.slice(0,n));
    }
    for(const depth of zoneDepths){
      const zone=movable.filter(s=>s.y+s.l>=used-depth);
      if(zone.length)removalSets.push(zone);
    }
    removalSets.push(rankedSmall.slice(0,Math.min(12,movable.length)));

    const seenSets=new Set();
    for(const removedList of removalSets){
      if(!this.hasTime())break;
      const ids=[...new Set(removedList.map(s=>s.id))];
      const setKey=ids.slice().sort().join('|');
      if(!ids.length||seenSets.has(setKey))continue;
      seenSets.add(setKey);
      const removed=new Set(ids);
      const base=placed.filter(s=>s.locked||!removed.has(s.id));
      if(!validateLayout(base,this.trailer).ok)continue;
      const pending=[...missing,...placed.filter(s=>removed.has(s.id))];
      const priorityOrders=[
        [...missing,...pending.filter(s=>!missing.some(m=>m.id===s.id))],
        [...missing].sort((a,b)=>b.w*b.l-a.w*a.l).concat(pending.filter(s=>!missing.some(m=>m.id===s.id)).sort((a,b)=>b.w*b.l-a.w*a.l)),
        ...this.rowCombinationOrders(pending),
        ...this.orders(pending).slice(0,8)
      ];
      const seenOrders=new Set();
      for(const order of priorityOrders){
        if(!this.hasTime())break;
        const key=order.map(s=>s.id).join('|');
        if(seenOrders.has(key))continue;
        seenOrders.add(key);
        const result=this.packPartial(order,base,originals,pending.length>18?260:360);
        if(!result||!validateLayout(result.stacks,this.trailer).ok)continue;
        const placedIds=new Set(result.stacks.map(s=>s.id));
        const stillMissing=originals.filter(s=>!placedIds.has(s.id));
        candidates.push({name:`Rescate final dirigido (${ids.length} reacomodadas)`,stacks:result.stacks,unplaced:stillMissing});
        if(!stillMissing.length)return candidates;
      }
    }
    return candidates;
  }


  deepRebuildRescue(placed,unplaced,originals){
    // Reconstrucción amplia: cuando faltan 1–2 pilas, permite abandonar temporalmente
    // una solución local buena y rehacer entre 25 % y 85 % de las pilas móviles.
    // La solución original siempre permanece como candidata fuera de este método.
    const missing=(unplaced||[]).map(Geometry.clone);
    if(!missing.length||missing.length>2)return [];
    const movable=placed.filter(s=>!s.locked);
    if(movable.length<4)return [];
    const used=Math.max(1,Geometry.usedLength(placed));
    const candidates=[], removalSets=[];
    const fractions=[0.25,0.40,0.60,0.75,0.85];
    const byEnd=[...movable].sort((a,b)=>(b.y+b.l)-(a.y+a.l));
    const byArea=[...movable].sort((a,b)=>b.w*b.l-a.w*a.l||(b.y+b.l)-(a.y+a.l));
    const bySmall=[...movable].sort((a,b)=>a.w*a.l-b.w*b.l||(b.y+b.l)-(a.y+a.l));

    for(const fraction of fractions){
      const count=Math.max(4,Math.min(movable.length,Math.ceil(movable.length*fraction)));
      removalSets.push(byEnd.slice(0,count));
      removalSets.push(byArea.slice(0,count));
      removalSets.push(bySmall.slice(0,count));
      const depth=used*fraction;
      const rearZone=movable.filter(s=>s.y+s.l>=used-depth);
      if(rearZone.length>=4)removalSets.push(rearZone);
    }
    // Último recurso: reconstrucción global de todas las pilas no bloqueadas.
    removalSets.push(movable);

    const seenSets=new Set();
    for(const removedList of removalSets){
      if(!this.hasTime())break;
      const ids=[...new Set(removedList.map(s=>s.id))];
      if(ids.length<4)continue;
      const setKey=ids.slice().sort().join('|');
      if(seenSets.has(setKey))continue;
      seenSets.add(setKey);
      const removed=new Set(ids);
      const base=placed.filter(s=>s.locked||!removed.has(s.id));
      if(!validateLayout(base,this.trailer).ok)continue;
      const removedPieces=placed.filter(s=>removed.has(s.id));
      const pending=[...missing,...removedPieces];

      // Las tres primeras rutas son deliberadamente distintas, no retoques del mismo plano.
      const distinctOrders=[
        [...missing,...removedPieces].sort((a,b)=>{
          const am=missing.some(m=>m.id===a.id)?0:1,bm=missing.some(m=>m.id===b.id)?0:1;
          return am-bm||b.w*b.l-a.w*a.l||b.l-a.l;
        }),
        [...pending].sort((a,b)=>a.w*a.l-b.w*b.l||a.l-b.l),
        [...pending].sort((a,b)=>b.l-a.l||a.w-b.w),
        [...pending].sort((a,b)=>b.w-a.w||a.l-b.l),
        ...this.rowCombinationOrders(pending),
        ...this.orders(pending).slice(0,10)
      ];
      const seenOrders=new Set();
      for(const order of distinctOrders){
        if(!this.hasTime())break;
        const key=order.map(s=>s.id).join('|');
        if(seenOrders.has(key))continue;
        seenOrders.add(key);
        const beam=pending.length>28?320:pending.length>18?460:620;
        const result=this.packPartial(order,base,originals,beam);
        if(!result||!validateLayout(result.stacks,this.trailer).ok)continue;
        const placedIds=new Set(result.stacks.map(s=>s.id));
        const stillMissing=originals.filter(s=>!placedIds.has(s.id));
        candidates.push({
          name:`Reconstrucción profunda (${ids.length} pilas rearmadas)`,
          stacks:result.stacks,
          unplaced:stillMissing
        });
        if(!stillMissing.length)return candidates;
      }
    }
    return candidates;
  }


  optimumEscapeRescue(placed,unplaced,originals){
    // Segundo optimizador independiente: abandona el óptimo local y reconstruye
    // zonas grandes con las pilas pendientes como objetivo obligatorio.
    const missing=(unplaced||[]).map(Geometry.clone);
    if(!missing.length||missing.length>2)return [];
    const movable=placed.filter(s=>!s.locked);
    if(movable.length<6)return [];
    const candidates=[], seenSets=new Set();
    const used=Math.max(1,Geometry.usedLength(placed));
    const fractions=[0.35,0.50,0.65,0.80,1.0];
    const windows=[];
    for(const f of fractions){
      const depth=used*f;
      windows.push([Math.max(0,used-depth),used]);          // zona trasera
      windows.push([0,Math.min(used,depth)]);              // zona delantera
      const mid=used/2; windows.push([Math.max(0,mid-depth/2),Math.min(used,mid+depth/2)]); // centro
    }
    const removalSets=[];
    for(const [a,b] of windows){
      const zone=movable.filter(s=>s.y < b && s.y+s.l > a);
      if(zone.length>=6)removalSets.push(zone);
    }
    const byArea=[...movable].sort((a,b)=>b.w*b.l-a.w*a.l);
    const byEnd=[...movable].sort((a,b)=>(b.y+b.l)-(a.y+a.l));
    const byWidth=[...movable].sort((a,b)=>b.w-a.w||b.l-a.l);
    for(const f of fractions){
      const n=Math.max(6,Math.min(movable.length,Math.ceil(movable.length*f)));
      removalSets.push(byArea.slice(0,n),byEnd.slice(0,n),byWidth.slice(0,n));
    }
    removalSets.push(movable);

    for(const removedList of removalSets){
      if(!this.hasTime())break;
      const ids=[...new Set(removedList.map(s=>s.id))];
      const key=ids.slice().sort().join('|');
      if(ids.length<6||seenSets.has(key))continue;
      seenSets.add(key);
      const removed=new Set(ids);
      const base=placed.filter(s=>s.locked||!removed.has(s.id));
      if(!validateLayout(base,this.trailer).ok)continue;
      const removedPieces=placed.filter(s=>removed.has(s.id));
      const pool=[...missing,...removedPieces];
      const rest=pool.filter(s=>!missing.some(m=>m.id===s.id));
      const orders=[
        [...missing,...rest].sort((a,b)=>{
          const am=missing.some(m=>m.id===a.id)?0:1,bm=missing.some(m=>m.id===b.id)?0:1;
          return am-bm||b.w*b.l-a.w*a.l;
        }),
        [...missing,...rest.sort((a,b)=>a.w*a.l-b.w*b.l)],
        [...missing,...rest.sort((a,b)=>b.w-a.w||b.l-a.l)],
        ...this.rowCombinationOrders(pool),
        ...this.orders(pool).slice(0,14)
      ];
      const seenOrders=new Set();
      for(const order of orders){
        if(!this.hasTime())break;
        const okey=order.map(s=>s.id).join('|');
        if(seenOrders.has(okey))continue; seenOrders.add(okey);
        const beam=pool.length>32?520:pool.length>20?760:980;
        const result=this.packPartial(order,base,originals,beam);
        if(!result||!validateLayout(result.stacks,this.trailer).ok)continue;
        const placedIds=new Set(result.stacks.map(s=>s.id));
        const stillMissing=originals.filter(s=>!placedIds.has(s.id));
        candidates.push({name:`Escape de óptimo local (${ids.length} pilas reconstruidas)`,family:'Escape global',stacks:result.stacks,unplaced:stillMissing});
        if(!stillMissing.length)return candidates;
      }
    }
    return candidates;
  }

  patternSeeds(input){
    const seeds=[];
    for(const pattern of this.patterns){
      if(!this.hasTime())break;
      if(!pattern||!Array.isArray(pattern.pieces)||!pattern.pieces.length)continue;
      if(Math.abs(Number(pattern.trailer?.width)-this.trailer.width)>EPS)continue;
      const remaining=input.map((s,i)=>({s,index:i})),used=new Set(),placed=[];
      for(const piece of pattern.pieces){
        const match=remaining.find(({s,index})=>!used.has(index)&&!s.locked&&((Math.abs(s.w-piece.w)<EPS&&Math.abs(s.l-piece.l)<EPS)||(isFourWay(s)&&s.canRotate!==false&&Math.abs(s.w-piece.l)<EPS&&Math.abs(s.l-piece.w)<EPS)));
        if(!match)continue;const candidate={...match.s,x:piece.x,y:piece.y};used.add(match.index);
        if(Math.abs(candidate.w-piece.w)>EPS){[candidate.w,candidate.l]=[candidate.l,candidate.w];candidate.rotated=!candidate.rotated;}
        if(Geometry.valid(candidate,placed,this.trailer))placed.push(candidate);
      }
      if(!placed.length)continue;
      const locked=input.filter(s=>s.locked);
      if(!validateLayout(locked,this.trailer).ok)continue;
      let base=[...locked];for(const s of placed)if(Geometry.valid(s,base,this.trailer))base.push(s);
      const rest=input.filter((s,i)=>!s.locked&&!used.has(i));
      if(!rest.length){if(validateLayout(base,this.trailer).ok)seeds.push({name:`Patrón aprendido: ${pattern.name}`,stacks:base});continue;}
      for(const order of this.orders(rest).slice(0,3)){
        const packed=this.pack(order,base,input,Math.min(70,rest.length>20?36:60));
        if(packed&&validateLayout(packed,this.trailer).ok){seeds.push({name:`Patrón aprendido: ${pattern.name}`,stacks:packed});break;}
      }
    }
    return seeds;
  }


  partialRank(state, originals){
    const loadedPallets=state.placed.reduce((sum,s)=>sum+(Number(s.qty)||1),0);
    const loadedArea=Geometry.floorArea(state.placed);
    return {loadedPallets,loadedStacks:state.placed.length,loadedArea,score:layoutScore(state.placed,this.trailer,originals)};
  }

  packPartial(order,locked,originals,beamWidth=140){
    let beams=[{placed:Geometry.clone(locked),unplaced:[]}];
    for(const original of order){
      if(!this.hasTime())break;
      const next=[];
      for(const state of beams){
        if(!this.hasTime())break;
        const options=this.placementOptions(original,state.placed,24);
        for(const c of options)next.push({placed:[...state.placed,c],unplaced:[...state.unplaced]});
        // Esta rama es esencial: conserva la mejor carga parcial aunque esta pila no quepa.
        next.push({placed:state.placed,unplaced:[...state.unplaced,Geometry.clone(original)]});
      }
      const ranked=next.map(state=>({state,rank:this.partialRank(state,originals)}));
      ranked.sort((a,b)=>
        b.rank.loadedPallets-a.rank.loadedPallets ||
        b.rank.loadedStacks-a.rank.loadedStacks ||
        b.rank.loadedArea-a.rank.loadedArea ||
        a.rank.score-b.rank.score
      );
      const unique=[],seen=new Set();
      for(const item of ranked){
        const key=item.state.placed.map(s=>`${s.id}:${s.x},${s.y},${s.w},${s.l}`).sort().join('|');
        if(seen.has(key))continue;
        seen.add(key);unique.push(item.state);
        if(unique.length>=beamWidth)break;
      }
      beams=unique;
    }
    if(!beams.length)return null;
    beams.sort((a,b)=>{
      const ar=this.partialRank(a,originals),br=this.partialRank(b,originals);
      return br.loadedPallets-ar.loadedPallets||br.loadedStacks-ar.loadedStacks||br.loadedArea-ar.loadedArea||ar.score-br.score;
    });
    const best=beams[0];
    const polished=this.sequenceRefine(best.placed,originals,3);
    return {stacks:validateLayout(polished,this.trailer).ok?polished:best.placed,unplaced:best.unplaced};
  }

  optimize(input){
    const locked=input.filter(s=>s.locked), movable=input.filter(s=>!s.locked);
    const lockedCheck=validateLayout(locked,this.trailer);
    if(!lockedCheck.ok)return {ok:false,message:`No se puede optimizar: ${explainValidation(lockedCheck)}`};

    const solutions=[...this.patternSeeds(input)].map(s=>({...s,unplaced:[]}));

    const repaired=this.repairLayout(input);
    if(repaired&&validateLayout(repaired,this.trailer).ok){
      solutions.push({name:'Reparación progresiva',stacks:repaired,unplaced:[]});
    }

    if(validateLayout(input,this.trailer).ok){
      const local=this.sequenceRefine(input,input,5);
      if(validateLayout(local,this.trailer).ok)solutions.push({name:'Ajuste con rotaciones',stacks:local,unplaced:[]});
    }

    const beamWidth=movable.length>28?42:movable.length>18?68:96;

    // Motor V2 por estructuras: crea planos globales completos antes de usar
    // la búsqueda local tradicional. Cada perfil representa otra arquitectura.
    if(!locked.length&&movable.length>=6){
      for(const plan of this.structuralProfiles(movable)){
        if(!this.hasTime())break;
        const built=this.structuralRowPack(plan.order,locked,input,plan.mode);
        if(!built)continue;
        solutions.push({name:plan.name,family:plan.family,...built});
        if(!built.unplaced.length)break;
      }
    }

    // Familias independientes: cada una parte de una filosofía distinta y compite
    // contra las demás. Esto evita mostrar tres retoques del mismo plano.
    if(movable.length>=8) for(const group of this.familyOrders(movable)){
      if(!this.hasTime())break;
      let familyBest=null;
      const seenFamily=new Set();
      for(const order of group.orders){
        if(!this.hasTime())break;
        const key=order.map(s=>s.id).join('|');if(seenFamily.has(key))continue;seenFamily.add(key);
        const partial=this.packPartial(order,locked,input,Math.max(120,beamWidth*2));
        if(!partial||!validateLayout(partial.stacks,this.trailer).ok)continue;
        const ids=new Set(partial.stacks.map(s=>s.id));
        const candidate={name:group.name,family:group.family,stacks:partial.stacks,unplaced:input.filter(s=>!ids.has(s.id))};
        const pallets=candidate.stacks.reduce((n,s)=>n+(Number(s.qty)||1),0);
        const bestPallets=familyBest?familyBest.stacks.reduce((n,s)=>n+(Number(s.qty)||1),0):-1;
        if(!familyBest||pallets>bestPallets||(pallets===bestPallets&&layoutScore(candidate.stacks,this.trailer,input)<layoutScore(familyBest.stacks,this.trailer,input)))familyBest=candidate;
      }
      if(familyBest)solutions.push(familyBest);
    }

    for(const order of this.orders(movable)){
      if(!this.hasTime())break;
      const packed=this.pack(order,locked,input,beamWidth);
      if(packed)solutions.push({name:'Optimización global completa',stacks:packed,unplaced:[]});
      if(!this.hasTime())break;
      const partial=this.packPartial(order,locked,input,Math.max(90,beamWidth));
      if(partial&&partial.stacks.length>=locked.length){
        solutions.push({name:partial.unplaced.length?'Máxima carga parcial':'Optimización global',...partial});
      }
    }

    // Antes de reconstrucciones generales, intenta rescatar específicamente las últimas 1–2 pilas
    // desde la mejor carga parcial disponible. La solución anterior permanece entre los candidatos.
    if(this.hasTime()){
      const partialSeeds=solutions.map(s=>{
        const ids=new Set((s.stacks||[]).map(x=>x.id));
        const missing=input.filter(x=>!ids.has(x.id));
        const pallets=(s.stacks||[]).reduce((sum,x)=>sum+(Number(x.qty)||1),0);
        return {s,missing,pallets};
      }).filter(x=>x.missing.length>0&&x.missing.length<=3)
        .sort((a,b)=>b.pallets-a.pallets||b.s.stacks.length-a.s.stacks.length);
      if(partialSeeds.length){
        const best=partialSeeds[0];
        const localRescues=this.lastMileRescue(best.s.stacks,best.missing,input);
        for(const rescued of localRescues)solutions.push(rescued);
        const localSolved=localRescues.some(r=>(r.unplaced||[]).length===0);
        if(!localSolved&&this.hasTime()){
          for(const rebuilt of this.deepRebuildRescue(best.s.stacks,best.missing,input))solutions.push(rebuilt);
        }
      }
    }

    if(this.hasTime()){
      for(const rebuilt of this.destroyRepair(input,input))solutions.push(rebuilt);
    }

    const valid=[],seen=new Set();
    for(const s of solutions){
      const check=validateLayout(s.stacks,this.trailer);
      if(!check.ok)continue;
      const placedIds=new Set(s.stacks.map(x=>x.id));
      s.unplaced=(s.unplaced||input.filter(x=>!placedIds.has(x.id))).filter(x=>!placedIds.has(x.id));
      const key=s.stacks.map(x=>`${x.id}:${x.x},${x.y},${x.w},${x.l}`).sort().join('|');
      if(seen.has(key))continue;
      seen.add(key);
      Object.assign(s,this.metrics(s.stacks,input));
      s.loadedStacks=s.stacks.length;
      s.loadedPallets=s.stacks.reduce((sum,x)=>sum+(Number(x.qty)||1),0);
      s.unplacedStacks=s.unplaced.length;
      s.unplacedPallets=s.unplaced.reduce((sum,x)=>sum+(Number(x.qty)||1),0);
      valid.push(s);
    }
    valid.sort((a,b)=>
      b.loadedPallets-a.loadedPallets ||
      b.loadedStacks-a.loadedStacks ||
      a.score-b.score
    );
    return valid.length?{ok:true,solutions:selectDiverseSolutions(valid,3,this.trailer),timedOut:this.timedOut}:{ok:false,timedOut:this.timedOut,message:'No se pudo colocar ninguna pila adicional de forma válida. Revisa las pilas bloqueadas y las dimensiones.'};
  }
}


function runPortfolioSearch(input,trailer,{totalTimeMs=21000,patterns=[],strategies=[],baselineSolutions=[]}={}){
  const profiles=[
    {profile:'large',seedOffset:11,label:'Portafolio · grandes primero'},
    {profile:'small',seedOffset:37,label:'Portafolio · pequeñas primero'},
    {profile:'rows',seedOffset:73,label:'Portafolio · filas y huecos'},
    {profile:'restart',seedOffset:109,label:'Portafolio · reinicio total'}
  ];
  const started=Date.now(), all=[...(baselineSolutions||[])];
  const bestBaseline=(baselineSolutions||[]).slice().sort((a,b)=>b.loadedPallets-a.loadedPallets||b.loadedStacks-a.loadedStacks||a.score-b.score)[0]||null;
  for(let i=0;i<profiles.length;i++){
    const elapsed=Date.now()-started,remaining=totalTimeMs-elapsed;
    if(remaining<80)break;
    const slots=profiles.length-i;
    const budget=Math.max(80,Math.floor(remaining/slots));
    const spec=profiles[i];
    const engine=new LoadEngine(trailer,{timeLimitMs:budget,patterns:i===0?patterns:[],strategies,seedOffset:spec.seedOffset,profile:spec.profile});
    const report=engine.optimize(Geometry.clone(input));
    if(report.ok)for(const sol of report.solutions||[])all.push({...sol,portfolio:spec.profile,name:`${spec.label} · ${sol.name||'resultado'}`});
  }
  // Segunda etapa especializada: parte de las mejores soluciones parciales y
  // reconstruye regiones grandes para escapar del óptimo local.
  const escapeSeeds=[...all].filter(s=>s&&Array.isArray(s.stacks)&&(s.unplaced||[]).length>0&&(s.unplaced||[]).length<=2)
    .sort((a,b)=>(b.loadedPallets||0)-(a.loadedPallets||0)||(b.loadedStacks||0)-(a.loadedStacks||0)).slice(0,3);
  for(let i=0;i<escapeSeeds.length;i++){
    const elapsed=Date.now()-started,remaining=totalTimeMs-elapsed;
    if(remaining<120)break;
    const seed=escapeSeeds[i];
    const engine=new LoadEngine(trailer,{timeLimitMs:remaining,patterns:[],strategies,seedOffset:211+i*97,profile:'restart'});
    for(const sol of engine.optimumEscapeRescue(Geometry.clone(seed.stacks),Geometry.clone(seed.unplaced||[]),Geometry.clone(input))){
      Object.assign(sol,engine.metrics(sol.stacks,input));
      sol.loadedStacks=sol.stacks.length;
      sol.loadedPallets=sol.stacks.reduce((n,x)=>n+(Number(x.qty)||1),0);
      sol.unplacedStacks=(sol.unplaced||[]).length;
      sol.unplacedPallets=(sol.unplaced||[]).reduce((n,x)=>n+(Number(x.qty)||1),0);
      all.push(sol);
      if(!sol.unplacedStacks)break;
    }
    if(all.some(s=>(s.unplacedStacks===0)||((s.unplaced||[]).length===0)))break;
  }

  const valid=[];
  for(const sol of all){
    if(!sol||!Array.isArray(sol.stacks)||!validateLayout(sol.stacks,trailer).ok)continue;
    if(bestBaseline && (sol.loadedPallets<bestBaseline.loadedPallets || (sol.loadedPallets===bestBaseline.loadedPallets&&sol.loadedStacks<bestBaseline.loadedStacks)))continue;
    valid.push(sol);
  }
  valid.sort((a,b)=>b.loadedPallets-a.loadedPallets||b.loadedStacks-a.loadedStacks||a.score-b.score);
  return {ok:valid.length>0,solutions:selectDiverseSolutions(valid,3,trailer),attemptedProfiles:profiles.length,elapsedMs:Date.now()-started};
}

// ===== app.js =====


const SCALE = 1.05;
const PRESETS = {
  "96x628":[96,628], "96x300":[96,300], "96x330":[96,330],
  "95x574":[95,574], "96x574":[96,574], "95x628":[95,628], "98x628":[98,628]
};
const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;


function normalizeLibraryItem(raw={}){
  const number=(...values)=>{for(const value of values){const n=Number(value);if(Number.isFinite(n)&&n>0)return n;}return 0;};
  const w=number(raw.w,raw.width,raw.ancho,raw.palletWidth);
  const l=number(raw.l,raw.length,raw.largo,raw.palletLength);
  const maxHeight=number(raw.maxHeight,raw.max,raw.altura,raw.height,raw.stackMax)||20;
  return {...raw,id:raw.id||uid(),name:String(raw.name||raw.nombre||`${l||'?'}×${w||'?'}`),w,l,maxHeight,type:raw.type||raw.tipo||'4-way',category:raw.category||raw.categoria||'Otra',canRotate:raw.canRotate!==false&&raw.canRotate!=='false'};
}

  const PATTERN_STORAGE_KEY = "loadmaster-visual-patterns-v1";

  class PatternMemory {
    constructor(){this.patterns=this.load();}
    load(){try{const v=JSON.parse(localStorage.getItem(PATTERN_STORAGE_KEY)||"[]");return Array.isArray(v)?v:[];}catch{return [];}}
    persist(){localStorage.setItem(PATTERN_STORAGE_KEY,JSON.stringify(this.patterns.slice(-100)));}
    add(pattern){this.patterns.push(pattern);this.persist();return pattern;}
    remove(id){this.patterns=this.patterns.filter(p=>p.id!==id);this.persist();}
    get(id){return this.patterns.find(p=>p.id===id);}
  }

  function detectRows(stacks,tolerance=1){
    const sorted=[...stacks].sort((a,b)=>a.y-b.y||a.x-b.x), rows=[];
    for(const stack of sorted){
      let row=rows.find(r=>Math.abs(r.y-stack.y)<=tolerance && Math.abs(r.length-stack.l)<=tolerance);
      if(!row){row={y:stack.y,length:stack.l,items:[]};rows.push(row);}
      row.items.push(stack);
    }
    return rows.map(r=>({...r,items:r.items.sort((a,b)=>a.x-b.x),signature:r.items.sort((a,b)=>a.x-b.x).map(s=>Number(s.w)).join('+')}));
  }

  function createPattern(name,stacks,trailer,source={}){
    const rows=detectRows(stacks);
    return {id:uid(),version:1,name:name||`Patrón ${new Date().toLocaleDateString()}`,createdAt:new Date().toISOString(),trailer:{width:trailer.width,length:trailer.length},source:{fileName:source.fileName||'',fileSize:source.fileSize||0,fileType:source.fileType||''},rows:rows.map(r=>({y:r.y,length:r.length,signature:r.signature})),pieces:stacks.map(s=>({name:s.name,w:s.w,l:s.l,x:s.x,y:s.y,qty:s.qty,type:s.type,category:s.category,canRotate:s.canRotate!==false,rotated:!!s.rotated}))};
  }

  const STRATEGY_STORAGE_KEY = "loadmaster-strategies-v1";
  class StrategyMemory {
    constructor(){this.items=this.load();}
    load(){try{const v=JSON.parse(localStorage.getItem(STRATEGY_STORAGE_KEY)||"[]");return Array.isArray(v)?v:[];}catch{return [];}}
    persist(){localStorage.setItem(STRATEGY_STORAGE_KEY,JSON.stringify(this.items.slice(-80)));}
    learn(stacks,trailer,source="auto"){
      if(!Array.isArray(stacks)||stacks.length<2)return;
      const sequence=[...stacks].sort((a,b)=>a.y-b.y||a.x-b.x).map(s=>({w:s.w,l:s.l,type:s.type||"",rotated:!!s.rotated}));
      const signature=sequence.map(s=>`${s.w}x${s.l}:${s.type}`).join("|");
      const existing=this.items.find(x=>x.signature===signature&&Math.abs(Number(x.trailerWidth)-Number(trailer.width))<EPS);
      if(existing){existing.hits=(existing.hits||1)+1;existing.updatedAt=new Date().toISOString();existing.source=source;}
      else this.items.push({id:uid(),signature,sequence,trailerWidth:trailer.width,hits:1,source,updatedAt:new Date().toISOString()});
      this.items.sort((a,b)=>(a.hits||1)-(b.hits||1));this.persist();
    }
  }

  class Store {
    constructor(){
      this.state={trailer:{width:96,length:628},stacks:[],pending:[],library:[],selectedId:null};
      this.history=[]; this.future=[];
      try{const saved=JSON.parse(localStorage.getItem("loadmaster-library")||"[]");this.state.library=Array.isArray(saved)?saved.map(normalizeLibraryItem):[];this.persistLibrary();}catch{}
    }
    snapshot(){return JSON.stringify(this.state);}
    remember(){this.history.push(this.snapshot()); if(this.history.length>80)this.history.shift(); this.future=[];}
    restore(raw){this.state=JSON.parse(raw);this.state.pending=this.state.pending||[];this.state.library=(this.state.library||[]).map(normalizeLibraryItem);this.persistLibrary();}
    persistLibrary(){localStorage.setItem("loadmaster-library",JSON.stringify(this.state.library));}
  }

  class App {
    constructor(){
      this.store=new Store(); this.patternMemory=new PatternMemory(); this.strategyMemory=new StrategyMemory(); this.installPrompt=null; this.lastSolutions=[]; this.referenceImage=null;
      this.bind(); this.syncTrailerInputs(); this.render();
      if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
    }
    get state(){return this.store.state;}
    toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2100);}
    selected(){return this.state.stacks.find(s=>s.id===this.state.selectedId);}
    valid(s){return Geometry.valid(s,this.state.stacks,this.state.trailer,s.id);}
    syncTrailerInputs(){$("trailerWidth").value=this.state.trailer.width;$("trailerLength").value=this.state.trailer.length;}
    bind(){
      window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();this.installPrompt=e;$("installBtn").hidden=false;});
      $("installBtn").onclick=async()=>{if(!this.installPrompt)return;this.installPrompt.prompt();await this.installPrompt.userChoice;this.installPrompt=null;$("installBtn").hidden=true;};
      $("trailerPreset").onchange=e=>{const v=PRESETS[e.target.value];if(v){$("trailerWidth").value=v[0];$("trailerLength").value=v[1];$("trailerAutofillStatus").textContent=`✓ Tráiler autocompletado: ${v[1]} largo × ${v[0]} ancho`;}};
      $("applyTrailer").onclick=()=>{this.store.remember();this.state.trailer={width:+$("trailerWidth").value||96,length:+$("trailerLength").value||628};this.render();};
      $("librarySelect").onchange=()=>this.loadLibrarySelection();
      $("saveLibrary").onclick=()=>this.saveLibraryItem();
      $("addPallet").onclick=()=>this.addPallets();
      $("rotateBtn").onclick=()=>this.rotateSelected(); $("floatRotateBtn").onclick=()=>this.rotateSelected();
      $("lockBtn").onclick=()=>this.toggleLock(); $("floatLockBtn").onclick=()=>this.toggleLock();
      $("duplicateBtn").onclick=()=>this.duplicateSelected();
      $("deleteBtn").onclick=()=>this.deleteSelected(); $("floatDeleteBtn").onclick=()=>this.deleteSelected();
      $("undoBtn").onclick=()=>this.undo(); $("redoBtn").onclick=()=>this.redo();
      $("compactBtn").onclick=()=>this.compact(); $("optimizeBtn").onclick=()=>this.optimize();
      $("clearBtn").onclick=()=>{if(!this.state.stacks.length)return;this.store.remember();this.state.stacks=[];this.state.selectedId=null;this.render();};
      $("demoBtn").onclick=()=>this.demo();
      $("saveLoadBtn").onclick=()=>this.saveFile(); $("openLoadBtn").onclick=()=>$("fileInput").click();
      $("fileInput").onchange=e=>this.openFile(e); $("printBtn").onclick=()=>window.print();
      $("closeOptimizer").onclick=()=>$("optimizerPanel").hidden=true;$("retryPendingBtn").onclick=()=>this.retryPending();$("clearPendingBtn").onclick=()=>this.clearPending();
      $("referenceImageInput").onchange=e=>this.loadReferenceImage(e);
      $("learnPatternBtn").onclick=()=>this.learnCurrentPattern();
      $("analyzePatternBtn").onclick=()=>this.analyzeCurrentRows();
      $("trailer").onclick=e=>{if(e.target===$("trailer")||e.target.classList.contains("freeZone")){this.state.selectedId=null;this.render();}};
    }

    loadReferenceImage(e){
      const file=e.target.files&&e.target.files[0];
      if(!file)return;
      if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>12*1024*1024){this.toast("Usa PNG, JPG o WebP de hasta 12 MB");e.target.value="";return;}
      if(this.referenceImage?.url)URL.revokeObjectURL(this.referenceImage.url);
      const url=URL.createObjectURL(file);this.referenceImage={url,fileName:file.name,fileSize:file.size,fileType:file.type};
      const root=$("referencePreview");root.innerHTML="";const img=document.createElement("img");img.src=url;img.alt="Captura de referencia";root.appendChild(img);
      if(!$("patternName").value)$("patternName").value=file.name.replace(/\.[^.]+$/,"");
      this.toast("Captura cargada como referencia");
    }
    analyzeCurrentRows(){
      if(!this.state.stacks.length)return this.toast("Agrega o abre una carga primero");
      const rows=detectRows(this.state.stacks);const text=rows.map((r,i)=>`Fila ${i+1}: ${r.signature || "sin datos"}`).join(" · ");
      let note=document.querySelector(".patternDetected");if(!note){note=document.createElement("div");note.className="patternDetected";$("patternList").before(note);}note.textContent=`Detectadas ${rows.length} filas: ${text}`;
      this.toast(`${rows.length} fila${rows.length===1?"":"s"} detectada${rows.length===1?"":"s"}`);
    }
    learnCurrentPattern(){
      if(!this.state.stacks.length)return this.toast("No hay un acomodo para aprender");
      const validation=validateLayout(this.state.stacks,this.state.trailer);
      if(!validation.ok)return this.toast(`Corrige la carga antes de aprender: ${explainValidation(validation)}`);
      const name=$("patternName").value.trim()||`Patrón ${this.patternMemory.patterns.length+1}`;
      const source=this.referenceImage||{};const pattern=createPattern(name,this.state.stacks,this.state.trailer,source);
      this.patternMemory.add(pattern);$("patternName").value="";this.renderPatterns();
      this.toast(`Patrón guardado: ${pattern.rows.map(r=>r.signature).filter(Boolean).join(" / ")||pattern.pieces.length+" pilas"}`);
    }
    applyPattern(id){
      const pattern=this.patternMemory.get(id);if(!pattern)return;
      const available=[...this.state.stacks],used=new Set(),placed=[];
      for(const piece of pattern.pieces){
        const idx=available.findIndex((s,i)=>!used.has(i)&&((Math.abs(s.w-piece.w)<EPS&&Math.abs(s.l-piece.l)<EPS)||((s.type==="4-way"&&s.canRotate!==false)&&Math.abs(s.w-piece.l)<EPS&&Math.abs(s.l-piece.w)<EPS)));
        if(idx<0)continue;const s=clone(available[idx]);used.add(idx);s.x=piece.x;s.y=piece.y;
        if(Math.abs(s.w-piece.w)>EPS){[s.w,s.l]=[s.l,s.w];s.rotated=!s.rotated;}placed.push(s);
      }
      if(!placed.length)return this.toast("La carga actual no contiene medidas compatibles");
      const untouched=available.filter((_,i)=>!used.has(i));this.store.remember();this.state.stacks=[...placed,...untouched];this.render();this.toast(`Patrón aplicado a ${placed.length} pila${placed.length===1?"":"s"}; optimiza para completar`);
    }
    deletePattern(id){this.patternMemory.remove(id);this.renderPatterns();this.toast("Patrón eliminado");}
    renderPatterns(){
      const root=$("patternList");if(!root)return;$("patternCount").textContent=this.patternMemory.patterns.length;root.innerHTML="";
      [...this.patternMemory.patterns].reverse().forEach(pattern=>{const item=document.createElement("div");item.className="patternItem";const sig=pattern.rows.map(r=>r.signature).filter(Boolean).join(" / ");item.innerHTML=`<div><strong></strong><small></small></div><span class="patternActions"><button type="button" data-use>Usar</button><button type="button" data-delete>×</button></span>`;item.querySelector("strong").textContent=pattern.name;item.querySelector("small").textContent=`${pattern.pieces.length} pilas · ${sig||"patrón libre"}${pattern.source?.fileName?" · captura: "+pattern.source.fileName:""}`;item.querySelector("[data-use]").onclick=()=>this.applyPattern(pattern.id);item.querySelector("[data-delete]").onclick=()=>this.deletePattern(pattern.id);root.appendChild(item);});
      if(!this.patternMemory.patterns.length)root.innerHTML='<div class="patternDetected">Todavía no hay patrones confirmados.</div>';
    }
    loadLibrarySelection(){
      const index=this.state.library.findIndex(x=>String(x.id)===String($("librarySelect").value));if(index<0)return;
      const item=normalizeLibraryItem(this.state.library[index]);this.state.library[index]=item;this.store.persistLibrary();
      const status=$("libraryAutofillStatus");
      if(!(item.w>0&&item.l>0)){$("palletWidth").value="";$("palletLength").value="";status.textContent="⚠ Esta medida guardada no contiene largo y ancho válidos.";this.toast("La medida guardada necesita largo y ancho");return;}
      $("palletWidth").value=item.w;$("palletLength").value=item.l;$("maxHeight").value=item.maxHeight;$("palletType").value=item.type;$("category").value=item.category;$("canRotate").checked=item.canRotate;$("palletName").value=item.name;status.textContent=`✓ Pallet autocompletado: ${item.l} largo × ${item.w} ancho · altura ${item.maxHeight}`;this.toast("Pallet autocompletado");
    }
    saveLibraryItem(){
      const item=normalizeLibraryItem({id:uid(),name:$("palletName").value.trim()||"Pallet",w:+$("palletWidth").value,l:+$("palletLength").value,maxHeight:+$("maxHeight").value,type:$("palletType").value,category:$("category").value,canRotate:$("canRotate").checked});
      this.state.library.push(item);this.store.persistLibrary();this.renderLibrary();this.toast("Medida guardada");
    }
    splitQty(total,max){const r=[];while(total>0){const n=Math.min(total,max);r.push(n);total-=n;}return r;}
    addPallets(){
      const w=+$("palletWidth").value,l=+$("palletLength").value,qty=+$("palletQty").value,max=+$("maxHeight").value;
      if(!(w>0&&l>0&&qty>0&&max>0)){this.toast("Revisa las medidas y cantidades");return;}
      this.store.remember();
      const base={name:$("palletName").value.trim()||`${w}×${l}`,w,l,type:$("palletType").value,category:$("category").value,canRotate:$("canRotate").checked,locked:false,rotated:false};
      this.splitQty(qty,max).forEach((n,i)=>this.state.stacks.push({...base,id:uid(),qty:n,x:Math.min(this.state.trailer.width-w,4+(i%2)*(w+2)),y:Math.max(0,Geometry.usedLength(this.state.stacks)+2)}));
      this.render();
    }
    rotateSelected(){const s=this.selected();if(!s)return this.toast("Selecciona una pila");if(s.locked)return this.toast("La pila está bloqueada");if(s.type!=="4-way"||!s.canRotate)return this.toast("Esta pila no puede girarse");this.store.remember();[s.w,s.l]=[s.l,s.w];s.rotated=!s.rotated;this.render();}
    toggleLock(){const s=this.selected();if(!s)return this.toast("Selecciona una pila");this.store.remember();s.locked=!s.locked;this.render();}
    duplicateSelected(){const s=this.selected();if(!s)return this.toast("Selecciona una pila");this.store.remember();const c={...clone(s),id:uid(),x:s.x+2,y:s.y+s.l+2,locked:false};this.state.stacks.push(c);this.state.selectedId=c.id;this.render();}
    deleteSelected(){const s=this.selected();if(!s)return this.toast("Selecciona una pila");this.store.remember();this.state.stacks=this.state.stacks.filter(x=>x.id!==s.id);this.state.selectedId=null;this.render();}
    undo(){if(!this.store.history.length)return;this.store.future.push(this.store.snapshot());this.store.restore(this.store.history.pop());this.syncTrailerInputs();this.render();}
    redo(){if(!this.store.future.length)return;this.store.history.push(this.store.snapshot());this.store.restore(this.store.future.pop());this.syncTrailerInputs();this.render();}
    renderPending(){
      const root=$("pendingList"),count=$("pendingCount");if(!root||!count)return;
      const pending=this.state.pending||[];count.textContent=pending.length;root.innerHTML="";
      if(!pending.length){root.innerHTML='<div class="pendingEmpty">No hay pilas pendientes.</div>';return;}
      pending.forEach(s=>{const row=document.createElement("div");row.className="pendingItem";row.innerHTML=`<div><strong>${s.name}</strong><small>${s.w}×${s.l} · ${s.qty||1} pallets · ${s.type}</small></div><button type="button" data-edit>Editar</button>`;row.querySelector("[data-edit]").onclick=()=>this.editPending(s.id);root.appendChild(row);});
    }
    editPending(id){
      const s=(this.state.pending||[]).find(x=>x.id===id);if(!s)return;
      $("palletWidth").value=s.w;$("palletLength").value=s.l;$("palletQty").value=s.qty||1;$("maxHeight").value=s.qty||1;$("palletType").value=s.type||"4-way";$("category").value=s.category||"New";$("canRotate").checked=s.canRotate!==false;$("palletName").value=s.name||`${s.w}×${s.l}`;
      this.store.remember();this.state.pending=this.state.pending.filter(x=>x.id!==id);this.renderPending();this.toast("Pila pendiente cargada en el formulario; edítala y pulsa Crear pilas");
    }
    retryPending(){
      if(!(this.state.pending||[]).length)return this.toast("No hay pilas pendientes");
      const start=Geometry.usedLength(this.state.stacks)+2;this.store.remember();
      this.state.pending.forEach((s,i)=>this.state.stacks.push({...clone(s),x:Math.max(0,Math.min(this.state.trailer.width-s.w,(i%2)*(s.w+2))),y:start+i*2}));
      this.state.pending=[];this.render();this.toast("Pendientes devueltas a la carga para reintentar");
    }
    clearPending(){if(!(this.state.pending||[]).length)return;this.store.remember();this.state.pending=[];this.renderPending();this.toast("Carga pendiente eliminada");}

    compact(){
      if(!this.state.stacks.length)return this.toast("No hay pilas");
      const engine=new LoadEngine(this.state.trailer);const before=clone(this.state.stacks);const result=engine.compact(before);
      if(!result.ok)return this.toast(result.message||"No se pudo compactar con seguridad");
      const after=result.stacks;
      const moved=after.filter(s=>{const o=before.find(x=>x.id===s.id);return Math.abs(o.x-s.x)>EPS||Math.abs(o.y-s.y)>EPS;}).length;
      if(!moved)return this.toast("La carga ya está compactada");
      this.store.remember();this.state.stacks=after;this.render();this.toast(`Compactación: ${moved} pila${moved===1?"":"s"} ajustada${moved===1?"":"s"}`);
    }
    optimize(){
      const allInput=[...this.state.stacks,...(this.state.pending||[])];
      if(!allInput.length)return this.toast("No hay pilas");
      $("optimizerPanel").hidden=false;$("optimizerSummary").textContent="Fase rápida: buscando durante hasta 9 segundos…";$("optimizerResults").innerHTML="";
      const original=clone(allInput),beforeUsed=Geometry.usedLength(this.state.stacks);
      const applyReport=(report,phaseLabel)=>{
        if(!report.ok){$("optimizerSummary").textContent=report.message;this.toast(report.message);return null;}
        const solutions=report.solutions;if(!solutions.length)return null;
        const best=solutions[0],validation=validateLayout(best.stacks,this.state.trailer);if(!validation.ok)return null;
        this.lastSolutions=solutions;this.lastUnplaced=clone(best.unplaced||[]);this.store.remember();this.state.stacks=clone(best.stacks);this.state.pending=clone(best.unplaced||[]);this.strategyMemory.learn(best.stacks,this.state.trailer,"optimización");this.render();
        const saved=Math.max(0,beforeUsed-best.used),leftText=best.unplacedStacks?` · ${best.unplacedStacks} pila${best.unplacedStacks===1?"":"s"} pendientes (${best.unplacedPallets} pallets)`:' · Toda la carga quedó dentro';
        $("optimizerSummary").textContent=`${phaseLabel}: ${best.loadedStacks} pilas / ${best.loadedPallets} pallets cargados · ${saved.toFixed(1)}\" menos de largo${leftText}`;
        this.renderSolutions(solutions,beforeUsed);return best;
      };
      setTimeout(()=>{
        const fast=new LoadEngine(this.state.trailer,{timeLimitMs:9000,patterns:this.patternMemory.patterns,strategies:this.strategyMemory.items});const fastReport=fast.optimize(original);const fastBest=applyReport(fastReport,"Resultado rápido");
        if(!fastBest||!fastBest.unplacedStacks){this.toast("Optimización terminada");return;}
        $("optimizerSummary").textContent+=` · Búsqueda profunda activa hasta 30 segundos…`;
        setTimeout(()=>{
          const merged=runPortfolioSearch(original,this.state.trailer,{totalTimeMs:21000,patterns:[],strategies:this.strategyMemory.items,baselineSolutions:fastReport.solutions||[]});
          if(!merged.ok)return;
          const deepBest=applyReport(merged,"Resultado final · portafolio independiente 9→30 s");
          this.toast(deepBest&&deepBest.unplacedStacks?"Se conservó la mayor carga encontrada; revisa Pendientes":"Toda la carga quedó acomodada");
        },50);
      },30);
    }
    renderSolutions(solutions,beforeUsed){
      const root=$("optimizerResults");root.innerHTML="";
      solutions.forEach((sol,i)=>{
        const card=document.createElement("article");card.className="optimizerResult";
        const left=sol.unplacedStacks?` · <b>${sol.unplacedStacks} fuera</b> (${sol.unplacedPallets} pallets): ${sol.unplaced.slice(0,3).map(s=>s.name).join(", ")}${sol.unplaced.length>3?"…":""}`:" · <b>Carga completa</b>";
        const label=sol.family?`${i===0?"Mejor solución":`Alternativa ${i+1}`} · ${sol.family}`:(i===0?"Mejor solución":`Alternativa ${i+1}`);
        card.innerHTML=`<div><strong>${label}</strong><p>${sol.loadedStacks} pilas / ${sol.loadedPallets} pallets dentro · ${sol.used.toFixed(1)}\" usados · ${sol.efficiency.toFixed(1)}% eficiencia · ${sol.rotated||0} giradas${left}</p></div><button type="button">Aplicar</button>`;
        card.querySelector("button").onclick=()=>{const validation=validateLayout(sol.stacks,this.state.trailer);if(!validation.ok)return this.toast(`Solución inválida: ${explainValidation(validation)}`);this.store.remember();this.state.stacks=clone(sol.stacks);this.state.pending=clone(sol.unplaced||[]);this.render();this.toast("Solución validada y aplicada");};root.appendChild(card);
      });
    }
    demo(){
      this.store.remember();this.state.trailer={width:96,length:628};this.state.stacks=[];
      const add=(name,w,l,x,y,qty=20,type="4-way")=>this.state.stacks.push({id:uid(),name,w,l,x,y,qty,type,category:"New",canRotate:type==="4-way",locked:false,rotated:false});
      add("48×40",48,40,0,0);add("48×40",48,40,48,0);add("42×42",42,42,0,42);add("42×42",42,42,54,42);add("Pila desviada",42,42,49,90);
      this.syncTrailerInputs();this.render();
    }
    saveFile(){const blob=new Blob([JSON.stringify({version:"5.7",...this.state},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="loadmaster-carga-v5.7.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
    async openFile(e){const file=e.target.files[0];if(!file)return;try{const d=JSON.parse(await file.text());this.store.remember();this.state.trailer=d.trailer||this.state.trailer;this.state.stacks=d.stacks||[];this.state.pending=d.pending||[];this.state.library=(d.library||this.state.library).map(normalizeLibraryItem);this.state.selectedId=null;this.store.persistLibrary();this.syncTrailerInputs();this.render();this.toast("Carga abierta");}catch{this.toast("Archivo no válido");}e.target.value="";}
    renderLibrary(){const sel=$("librarySelect"),current=sel.value;sel.innerHTML='<option value="">— Nueva medida —</option>';this.state.library.forEach(item=>{const o=document.createElement("option");o.value=item.id;o.textContent=`${item.name} · ${item.type} · máx ${item.maxHeight}`;sel.appendChild(o);});if([...sel.options].some(o=>o.value===current))sel.value=current;}
    render(){
      const trailer=$("trailer");trailer.style.width=`${this.state.trailer.width*SCALE}px`;trailer.style.height=`${this.state.trailer.length*SCALE}px`;trailer.querySelectorAll(".stack").forEach(n=>n.remove());
      this.state.stacks.forEach(s=>{const el=document.createElement("div");el.className="stack"+(s.id===this.state.selectedId?" selected":"")+(s.locked?" locked":"")+(this.valid(s)?"":" invalid");el.dataset.id=s.id;el.style.left=`${s.x*SCALE}px`;el.style.top=`${s.y*SCALE}px`;el.style.width=`${s.w*SCALE}px`;el.style.height=`${s.l*SCALE}px`;el.innerHTML=`${s.name}<small>${s.qty} alto · ${s.type}</small>`;trailer.appendChild(el);this.wireDrag(el,s);});
      this.renderLibrary();this.renderSelection();this.renderMetrics();this.renderPatterns();this.renderPending();
    }
    renderSelection(){const s=this.selected();$("selectedInfo").textContent=s?`${s.name} · ${s.qty} alto · ${s.type} · ${s.category}${s.locked?" · bloqueada":""}`:"Ninguna seleccionada";$("floatingTools").hidden=!s;if(s){$("bottomSelectedName").textContent=`${s.name} · ${s.qty} alto · ${s.type}`;$("floatLockBtn").textContent=s.locked?"🔓 Desbloq.":"🔒 Bloq.";const can=s.type==="4-way"&&s.canRotate&&s.w!==s.l;$("floatRotateBtn").disabled=!can;}}
    renderMetrics(){const used=Geometry.usedLength(this.state.stacks),free=Math.max(0,this.state.trailer.length-used),area=Geometry.floorArea(this.state.stacks),total=this.state.trailer.width*this.state.trailer.length,env=Math.max(1,this.state.trailer.width*used);$("metricStacks").textContent=this.state.stacks.length;$("metricPallets").textContent=this.state.stacks.reduce((a,s)=>a+s.qty,0);$("metricUsed").textContent=`${used.toFixed(1)}\"`;$("metricFree").textContent=`${free.toFixed(1)}\"`;$("metricUtilization").textContent=`${Math.min(100,area/Math.max(1,total)*100).toFixed(1)}%`;$("metricEfficiency").textContent=`${Math.min(100,area/env*100).toFixed(1)}%`;const bad=this.state.stacks.some(s=>!this.valid(s));$("metricStatus").textContent=bad?"Hay conflicto":"Carga válida";$("metricStatus").style.color=bad?"#dc2626":"#16a34a";$("freeZone").style.top=`${used*SCALE}px`;$("freeZone").style.height=`${free*SCALE}px`;}
    wireDrag(el,s){let active=false,startX=0,startY=0,origin=null,before=null,moved=false;el.onpointerdown=e=>{e.preventDefault();e.stopPropagation();this.state.selectedId=s.id;this.renderSelection();if(s.locked)return this.toast("Esta pila está bloqueada");active=true;startX=e.clientX;startY=e.clientY;origin={x:s.x,y:s.y};before=this.store.snapshot();moved=false;el.setPointerCapture?.(e.pointerId);};el.onpointermove=e=>{if(!active)return;const dx=(e.clientX-startX)/SCALE,dy=(e.clientY-startY)/SCALE;if(Math.abs(dx)>0.5||Math.abs(dy)>0.5)moved=true;s.x=roundQuarter(origin.x+dx);s.y=roundQuarter(origin.y+dy);el.style.left=`${s.x*SCALE}px`;el.style.top=`${s.y*SCALE}px`;el.classList.toggle("invalid",!this.valid(s));this.renderMetrics();};const finish=()=>{if(!active)return;active=false;if(moved){this.store.history.push(before);this.store.future=[];const others=this.state.stacks.filter(o=>o.id!==s.id);const axes=Geometry.candidateAxes(s,others,this.state.trailer);const nx=[...axes.xs].sort((a,b)=>Math.abs(a-s.x)-Math.abs(b-s.x))[0],ny=[...axes.ys].sort((a,b)=>Math.abs(a-s.y)-Math.abs(b-s.y))[0];const test={...s,x:nx,y:ny};if(Math.abs(nx-s.x)<=4&&Geometry.valid(test,others,this.state.trailer))s.x=nx;const test2={...s,y:ny};if(Math.abs(ny-s.y)<=4&&Geometry.valid(test2,others,this.state.trailer))s.y=ny;this.render();if(validateLayout(this.state.stacks,this.state.trailer).ok)this.strategyMemory.learn(this.state.stacks,this.state.trailer,"corrección manual");}};el.onpointerup=finish;el.onpointercancel=finish;}
  }



new App();
