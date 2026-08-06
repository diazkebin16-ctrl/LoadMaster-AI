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


function intelligentSolutionRank(sol,trailer,best=null){
  const pendingStacks=Number(sol.unplacedStacks??(sol.unplaced||[]).length)||0;
  const pendingPallets=Number(sol.unplacedPallets??(sol.unplaced||[]).reduce((n,x)=>n+(Number(x.qty)||1),0))||0;
  const efficiency=Math.max(0,Math.min(100,Number(sol.efficiency)||0));
  const used=Math.max(0,Number(sol.used)||Geometry.usedLength(sol.stacks||[]));
  const moved=Math.max(0,Number(sol.moved)||0),rotated=Math.max(0,Number(sol.rotated)||0);
  const total=Math.max(1,(sol.stacks||[]).length+pendingStacks);
  const completion=pendingStacks===0?48:Math.max(0,42-pendingPallets*5-pendingStacks*3);
  const utilization=efficiency*0.24;
  const lengthQuality=Math.max(0,10*(1-used/Math.max(1,trailer.length)));
  const stability=Math.max(0,8-(moved/total)*5-(rotated/total)*2);
  const compactness=Math.max(0,7-Math.min(7,(Number(sol.score)||0)/2500));
  const learned=/aprendid|adaptativ|simulaci/i.test(`${sol.name||''} ${sol.family||''}`)?3:0;
  const score=Math.max(0,Math.min(100,completion+utilization+lengthQuality+stability+compactness+learned));
  const reasons=[];
  if(!pendingStacks)reasons.push('carga completa');
  else reasons.push(`${pendingStacks} pila${pendingStacks===1?'':'s'} pendiente${pendingStacks===1?'':'s'}`);
  if(efficiency>=97)reasons.push('ocupación excelente');else if(efficiency>=92)reasons.push('buena ocupación');
  if(best&&used+0.25<(Number(best.used)||Infinity))reasons.push('usa menos largo');
  if(moved<=Math.max(1,total*.15))reasons.push('pocos movimientos');
  const label=score>=95?'Excelente':score>=88?'Muy buena':score>=78?'Buena':score>=65?'Aceptable':'Mejorable';
  return {rankScore:score,rankLabel:label,rankReasons:reasons.slice(0,3)};
}

function rankSolutionsIntelligently(solutions,trailer){
  if(!solutions.length)return [];
  const provisional=[...solutions].sort((a,b)=>
    b.loadedPallets-a.loadedPallets||b.loadedStacks-a.loadedStacks||a.score-b.score
  );
  const best=provisional[0];
  for(const sol of solutions)Object.assign(sol,intelligentSolutionRank(sol,trailer,best));
  return [...solutions].sort((a,b)=>
    b.loadedPallets-a.loadedPallets ||
    b.loadedStacks-a.loadedStacks ||
    b.rankScore-a.rankScore ||
    a.unplacedPallets-b.unplacedPallets ||
    a.used-b.used ||
    a.score-b.score
  );
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
      const similarityPenalty=minDistance<0.035?1.5:0;
      const rankBonus=(Number(candidate.rankScore)||0)/40;
      const value=minDistance*12+familyBonus+rankBonus-qualityGap-similarityPenalty;
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
    const refined=this.automaticCompact(this.sequenceRefine(input,input,8),"deep");
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

  gravityCompact(input){
    // Compactación tipo gravedad hacia la nariz (y=0). Elimina huecos
    // verticales sin cambiar el orden lateral ni reconstruir el plano.
    const stacks=input.map(Geometry.clone);
    for(let pass=0;pass<10;pass++){
      let moved=false;
      const ordered=stacks.filter(s=>!s.locked).sort((a,b)=>a.y-b.y||a.x-b.x);
      for(const s of ordered){
        let target=0;
        for(const o of stacks){
          if(o.id===s.id)continue;
          const horizontal=s.x<o.x+o.w-EPS&&s.x+s.w>o.x+EPS;
          if(horizontal&&o.y+o.l<=s.y+EPS)target=Math.max(target,o.y+o.l);
        }
        target=roundQuarter(target);
        if(target<s.y-EPS){
          const candidate={...s,y:target};
          const others=stacks.filter(o=>o.id!==s.id);
          if(Geometry.valid(candidate,others,this.trailer)){s.y=target;moved=true;}
        }
      }
      if(!moved)break;
    }
    return stacks;
  }

  lateralCompact(input,direction="left"){
    const stacks=input.map(Geometry.clone);
    for(let pass=0;pass<10;pass++){
      let moved=false;
      const ordered=stacks.filter(s=>!s.locked).sort((a,b)=>direction==="left"?a.x-b.x:b.x-a.x||a.y-b.y);
      for(const s of ordered){
        let target=direction==="left"?0:this.trailer.width-s.w;
        for(const o of stacks){
          if(o.id===s.id)continue;
          const vertical=s.y<o.y+o.l-EPS&&s.y+s.l>o.y+EPS;
          if(!vertical)continue;
          if(direction==="left"&&o.x+o.w<=s.x+EPS)target=Math.max(target,o.x+o.w);
          if(direction==="right"&&o.x>=s.x+s.w-EPS)target=Math.min(target,o.x-s.w);
        }
        target=roundQuarter(target);
        const improves=direction==="left"?target<s.x-EPS:target>s.x+EPS;
        if(improves){const candidate={...s,x:target};const others=stacks.filter(o=>o.id!==s.id);if(Geometry.valid(candidate,others,this.trailer)){s.x=target;moved=true;}}
      }
      if(!moved)break;
    }
    return stacks;
  }

  automaticCompact(input,level="deep"){
    let stacks=input.map(Geometry.clone);
    const passes=level==="soft"?1:level==="medium"?2:4;
    for(let i=0;i<passes;i++){
      const before=stacks.map(s=>`${s.id}:${s.x},${s.y}`).join("|");
      stacks=this.gravityCompact(stacks);
      if(level!=="soft"){
        const left=this.lateralCompact(stacks,"left");
        const right=this.lateralCompact(stacks,"right");
        const leftUsed=Geometry.usedLength(left),rightUsed=Geometry.usedLength(right);
        stacks=leftUsed<=rightUsed+EPS?left:right;
        stacks=this.gravityCompact(stacks);
      }
      if(level==="deep")stacks=this.sequenceRefine(stacks,input,2);
      if(!validateLayout(stacks,this.trailer).ok)return input.map(Geometry.clone);
      const after=stacks.map(s=>`${s.id}:${s.x},${s.y}`).join("|");
      if(before===after)break;
    }
    return stacks;
  }


  simulateMovementSequences(placed,unplaced,originals,{maxDepth=3,beamWidth=24}={}){
    // v5.28: ensaya secuencias completas sobre copias del plano. Ningún
    // movimiento toca la solución visible hasta que la secuencia final supera
    // la mejor carga conocida y pasa la validación completa.
    const baseline=placed.map(Geometry.clone);
    if(!validateLayout(baseline,this.trailer).ok)return [];
    const originalMap=new Map(originals.map(s=>[s.id,s]));
    const baselineIds=new Set(baseline.map(s=>s.id));
    const pending=(unplaced||originals.filter(s=>!baselineIds.has(s.id))).map(Geometry.clone);
    const baselinePallets=baseline.reduce((n,s)=>n+(Number(s.qty)||1),0);
    const candidates=[];
    const stateKey=st=>st.map(s=>`${s.id}:${s.x},${s.y},${s.w},${s.l}`).sort().join('|');
    const evaluate=st=>{
      const ids=new Set(st.map(s=>s.id));
      const missing=originals.filter(s=>!ids.has(s.id));
      const pallets=st.reduce((n,s)=>n+(Number(s.qty)||1),0);
      const area=Geometry.floorArea(st);
      const used=Geometry.usedLength(st);
      const dead=Math.max(0,this.trailer.width*used-area);
      return {missing,pallets,rank:pallets*1e12+st.length*1e9-area*1e3-used*1e2-dead-layoutScore(st,this.trailer,originals)};
    };
    const tryPending=layout=>{
      let st=layout.map(Geometry.clone), remaining=[];
      const ordered=[...pending].sort((a,b)=>b.w*b.l-a.w*a.l);
      for(const piece of ordered){
        const options=this.placementOptions(piece,st,120);
        if(!options.length){remaining.push(piece);continue;}
        options.sort((a,b)=>(a.y+a.l)-(b.y+b.l)||Geometry.contactScore(b,st,this.trailer)-Geometry.contactScore(a,st,this.trailer)||a.x-b.x);
        st.push(options[0]);
      }
      st=this.automaticCompact(st,'medium');
      if(!validateLayout(st,this.trailer).ok)return null;
      const ids=new Set(st.map(s=>s.id));
      return {stacks:st,unplaced:originals.filter(s=>!ids.has(s.id))};
    };

    const start={stacks:baseline,moves:[]};
    let beam=[start];
    const globalSeen=new Set([stateKey(baseline)]);
    for(let depth=1;depth<=maxDepth&&this.hasTime();depth++){
      const next=[];
      for(const state of beam){
        if(!this.hasTime())break;
        const movable=state.stacks.filter(s=>!s.locked).sort((a,b)=>{
          const ac=Geometry.contactScore(a,state.stacks.filter(o=>o.id!==a.id),this.trailer);
          const bc=Geometry.contactScore(b,state.stacks.filter(o=>o.id!==b.id),this.trailer);
          return ac-bc||(b.y+b.l)-(a.y+a.l);
        }).slice(0,12);
        for(const piece of movable){
          if(!this.hasTime())break;
          const others=state.stacks.filter(s=>s.id!==piece.id);
          const options=this.placementOptions(piece,others,18)
            .filter(c=>!samePose(c,piece))
            .slice(0,6);
          for(const option of options){
            const stacks=[...others,option];
            if(!validateLayout(stacks,this.trailer).ok)continue;
            const key=stateKey(stacks);if(globalSeen.has(key))continue;globalSeen.add(key);
            next.push({stacks,moves:[...state.moves,{type:'move',id:piece.id,from:{x:piece.x,y:piece.y,w:piece.w,l:piece.l},to:{x:option.x,y:option.y,w:option.w,l:option.l}}]});
          }
          if(isFourWay(piece)&&piece.canRotate!==false&&Math.abs(piece.w-piece.l)>EPS){
            const rotated={...piece,w:piece.l,l:piece.w,rotated:!piece.rotated};
            for(const option of this.placementOptions(rotated,others,12).filter(c=>!samePose(c,piece)).slice(0,4)){
              const stacks=[...others,option];if(!validateLayout(stacks,this.trailer).ok)continue;
              const key=stateKey(stacks);if(globalSeen.has(key))continue;globalSeen.add(key);
              next.push({stacks,moves:[...state.moves,{type:'rotate-move',id:piece.id,to:{x:option.x,y:option.y,w:option.w,l:option.l}}]});
            }
          }
        }
        // Intercambios virtuales entre piezas: se validan como una sola secuencia.
        for(let i=0;i<Math.min(8,movable.length);i++)for(let j=i+1;j<Math.min(8,movable.length);j++){
          if(!this.hasTime())break;
          const a=movable[i],b=movable[j],others=state.stacks.filter(s=>s.id!==a.id&&s.id!==b.id);
          const posesA=this.orientations(a).map(x=>({...x,x:b.x,y:b.y}));
          const posesB=this.orientations(b).map(x=>({...x,x:a.x,y:a.y}));
          for(const na of posesA)for(const nb of posesB){
            if(!Geometry.valid(na,others,this.trailer)||!Geometry.valid(nb,[...others,na],this.trailer))continue;
            const stacks=[...others,na,nb],key=stateKey(stacks);if(globalSeen.has(key))continue;globalSeen.add(key);
            next.push({stacks,moves:[...state.moves,{type:'swap',ids:[a.id,b.id]}]});
          }
        }
      }
      const ranked=[];
      for(const state of next){
        const rescued=tryPending(state.stacks);
        if(rescued){
          const ev=evaluate(rescued.stacks);
          if(ev.pallets>baselinePallets||ev.missing.length<pending.length){
            candidates.push({name:`Simulación de movimientos · ${state.moves.length} pasos`,family:'Simulación',stacks:rescued.stacks,unplaced:ev.missing,simulatedMoves:state.moves});
            if(!ev.missing.length)return candidates;
          }
        }
        ranked.push({state,rank:evaluate(state.stacks).rank});
      }
      ranked.sort((a,b)=>b.rank-a.rank);
      beam=[];const localSeen=new Set();
      for(const item of ranked){const key=stateKey(item.state.stacks);if(localSeen.has(key))continue;localSeen.add(key);beam.push(item.state);if(beam.length>=beamWidth)break;}
      if(!beam.length)break;
    }
    return candidates;
  }

  compactPendingRescue(placed,unplaced,originals){
    // Paso final: compactar primero y volver a probar todas las pendientes en
    // los huecos reales antes de recurrir a reconstrucciones grandes.
    if(!unplaced||!unplaced.length)return null;
    let base=this.gravityCompact(placed);
    if(!validateLayout(base,this.trailer).ok)return null;
    let pending=unplaced.map(Geometry.clone);
    const orderPending=list=>[...list].sort((a,b)=>a.w*a.l-b.w*b.l||a.l-b.l||a.w-b.w);
    for(let pass=0;pass<4&&pending.length;pass++){
      const next=[];
      for(const original of orderPending(pending)){
        const options=this.placementOptions(original,base,240);
        if(!options.length){next.push(original);continue;}
        // Prefiere el hueco más cercano a la nariz y con mayor contacto.
        options.sort((a,b)=>(a.y+a.l)-(b.y+b.l)||Geometry.contactScore(b,base,this.trailer)-Geometry.contactScore(a,base,this.trailer)||a.x-b.x);
        base.push(options[0]);
      }
      const before=next.length;
      base=this.gravityCompact(base);
      pending=next;
      if(pending.length===before&&pass>0)break;
    }
    if(!validateLayout(base,this.trailer).ok)return null;
    const placedIds=new Set(base.map(s=>s.id));
    const stillMissing=originals.filter(s=>!placedIds.has(s.id));
    return {name:stillMissing.length?'Compactación + revisión de huecos':'Compactación final · carga completa',family:'Compactación',stacks:base,unplaced:stillMissing};
  }

  normalizeCandidate(candidate,originals){
    // v5.12: toda solución debe estabilizarse antes de ser evaluada. Primero
    // elimina huecos verticales y después vuelve a insertar las pendientes.
    if(!candidate||!Array.isArray(candidate.stacks))return null;
    let stacks=this.automaticCompact(candidate.stacks,"deep");
    if(!validateLayout(stacks,this.trailer).ok)return null;
    const ids=new Set(stacks.map(s=>s.id));
    let missing=originals.filter(s=>!ids.has(s.id));
    if(missing.length){
      const rescued=this.compactPendingRescue(stacks,missing,originals);
      if(rescued&&validateLayout(rescued.stacks,this.trailer).ok){
        stacks=rescued.stacks;
        missing=rescued.unplaced||[];
      }
    }
    return {...candidate,name:missing.length?`${candidate.name||'Solución'} · normalizada`:`${candidate.name||'Solución'} · completa`,family:candidate.family||'Normalizada',stacks,unplaced:missing};
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

    // Antes de cualquier reconstrucción, elimina huecos verticales y vuelve a
    // insertar las pendientes. Esto reproduce el ajuste manual de juntar pilas.
    if(this.hasTime()){
      const compactSeeds=solutions.map(s=>{
        const ids=new Set((s.stacks||[]).map(x=>x.id));
        const missing=input.filter(x=>!ids.has(x.id));
        const pallets=(s.stacks||[]).reduce((sum,x)=>sum+(Number(x.qty)||1),0);
        return {s,missing,pallets};
      }).filter(x=>x.missing.length>0)
        .sort((a,b)=>b.pallets-a.pallets||b.s.stacks.length-a.s.stacks.length)
        .slice(0,8);
      for(const seed of compactSeeds){
        if(!this.hasTime())break;
        const compacted=this.compactPendingRescue(seed.s.stacks,seed.missing,input);
        if(compacted)solutions.push(compacted);
        if(compacted&&!(compacted.unplaced||[]).length)break;
      }
    }

    // Simulación de movimientos: ensaya secuencias de traslados, giros e
    // intercambios sobre copias invisibles de las mejores cargas parciales.
    // Solo agrega una candidata cuando la secuencia completa mejora el resultado.
    if(this.hasTime()){
      const simulationSeeds=solutions.map(s=>{
        const ids=new Set((s.stacks||[]).map(x=>x.id));
        const missing=input.filter(x=>!ids.has(x.id));
        const pallets=(s.stacks||[]).reduce((sum,x)=>sum+(Number(x.qty)||1),0);
        return {s,missing,pallets};
      }).filter(x=>x.missing.length>0&&x.missing.length<=4)
        .sort((a,b)=>b.pallets-a.pallets||b.s.stacks.length-a.s.stacks.length)
        .slice(0,3);
      for(const seed of simulationSeeds){
        if(!this.hasTime())break;
        const simulated=this.simulateMovementSequences(seed.s.stacks,seed.missing,input,{maxDepth:3,beamWidth:24});
        for(const candidate of simulated)solutions.push(candidate);
        if(simulated.some(x=>!(x.unplaced||[]).length))break;
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
    // Normaliza todos los candidatos finalistas. Para mantener el límite de
    // tiempo, primero elimina duplicados y conserva los 48 candidatos con mayor
    // carga, incluyendo al menos uno de cada familia de búsqueda.
    const prelimSeen=new Set(),prelim=[];
    for(const raw of solutions){
      if(!raw||!Array.isArray(raw.stacks))continue;
      const key=raw.stacks.map(x=>`${x.id}:${x.x},${x.y},${x.w},${x.l}`).sort().join('|');
      if(prelimSeen.has(key))continue;prelimSeen.add(key);
      const pallets=raw.stacks.reduce((n,x)=>n+(Number(x.qty)||1),0);
      prelim.push({raw,pallets,count:raw.stacks.length,used:Geometry.usedLength(raw.stacks)});
    }
    prelim.sort((a,b)=>b.pallets-a.pallets||b.count-a.count||a.used-b.used);
    const candidatePool=prelim.slice(0,48).map(x=>x.raw);
    for(const family of new Set(prelim.map(x=>x.raw.family).filter(Boolean))){
      const representative=prelim.find(x=>x.raw.family===family)?.raw;
      if(representative&&!candidatePool.includes(representative))candidatePool.push(representative);
    }
    // Normalización obligatoria antes de calificar: ningún finalista puede ser
    // elegido mientras conserve huecos que aún se pueden cerrar.
    for(const raw of candidatePool){
      const s=this.normalizeCandidate(raw,input);
      if(!s)continue;
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
    const rankedValid=rankSolutionsIntelligently(valid,this.trailer);
    if(rankedValid.length){
      const selected=selectDiverseSolutions(rankedValid,3,this.trailer);
      const learned=rankedValid.find(s=>String(s.name).includes('Patrón aprendido'));
      if(learned&&!selected.some(s=>s===learned||String(s.name).includes('Patrón aprendido'))){
        if(selected.length>=3)selected[selected.length-1]=learned;else selected.push(learned);
      }
      selected.sort((a,b)=>b.loadedPallets-a.loadedPallets||b.loadedStacks-a.loadedStacks||(b.rankScore||0)-(a.rankScore||0)||a.score-b.score);
      return {ok:true,solutions:selected,timedOut:this.timedOut};
    }
    return {ok:false,timedOut:this.timedOut,message:'No se pudo colocar ninguna pila adicional de forma válida. Revisa las pilas bloqueadas y las dimensiones.'};
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
  // Repite rondas independientes hasta encontrar una carga completa o agotar
  // el presupuesto. Cada ronda usa semillas nuevas para que un acierto no dependa
  // de presionar Optimizar cinco veces manualmente.
  let attempt=0;
  while(Date.now()-started<totalTimeMs-120 && attempt<16){
    const spec=profiles[attempt%profiles.length];
    const remaining=totalTimeMs-(Date.now()-started);
    const budget=Math.max(140,Math.min(2600,Math.floor(remaining/Math.max(1,Math.min(4,16-attempt)))));
    const engine=new LoadEngine(trailer,{timeLimitMs:budget,patterns:attempt===0?patterns:[],strategies,seedOffset:spec.seedOffset+attempt*131,profile:spec.profile});
    const report=engine.optimize(Geometry.clone(input));
    if(report.ok)for(const sol of report.solutions||[])all.push({...sol,portfolio:spec.profile,name:`${spec.label} · intento ${attempt+1} · ${sol.name||'resultado'}`});
    if(all.some(s=>s&&((s.unplacedStacks===0)||((s.unplaced||[]).length===0))))break;
    attempt++;
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
  const ranked=rankSolutionsIntelligently(valid,trailer);
  return {ok:ranked.length>0,solutions:selectDiverseSolutions(ranked,3,trailer),attemptedProfiles:profiles.length,attemptedRuns:attempt+1,elapsedMs:Date.now()-started};
}

// ===== app.js =====


const SCALE = 1.05;
const LEGACY_TRAILER_PANEL_KEY="lm_trailer_panel_open"; // compatibilidad v5.19
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
  return {...raw,id:raw.id||uid(),name:String(raw.name||raw.nombre||`${l||'?'}×${w||'?'}`),w,l,maxHeight,type:raw.type||raw.tipo||'4-way',category:raw.category||raw.categoria||'Otra',canRotate:raw.canRotate!==false&&raw.canRotate!=='false',favorite:raw.favorite===true||raw.favorite==='true',notes:String(raw.notes||raw.notas||'')};
}


  function createPlanCanvas(stacks,trailer,{thumbnail=false,title="LoadMaster AI"}={}){
    const safeStacks=Array.isArray(stacks)?stacks:[];
    const scale=thumbnail?Math.min(1.5,100/Math.max(1,trailer.width),180/Math.max(1,trailer.length)):Math.min(4,820/Math.max(1,trailer.width),2200/Math.max(1,trailer.length));
    const margin=thumbnail?10:34;
    const header=thumbnail?0:74;
    const footer=thumbnail?0:58;
    const width=Math.max(thumbnail?120:420,Math.ceil(trailer.width*scale+margin*2));
    const height=Math.max(thumbnail?220:620,Math.ceil(trailer.length*scale+margin*2+header+footer));
    const canvas=document.createElement('canvas');
    const dpr=thumbnail?1:Math.min(2,window.devicePixelRatio||1);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
    const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    ctx.fillStyle='#eef1f5';ctx.fillRect(0,0,width,height);
    if(!thumbnail){
      ctx.fillStyle='#111827';ctx.font='700 24px system-ui, sans-serif';ctx.fillText(title,margin,34);
      ctx.fillStyle='#4b5563';ctx.font='15px system-ui, sans-serif';ctx.fillText(`${trailer.length}\" largo × ${trailer.width}\" ancho · ${safeStacks.length} pilas · ${safeStacks.reduce((a,x)=>a+(Number(x.qty)||0),0)} pallets`,margin,58);
    }
    const ox=margin,oy=margin+header;
    ctx.fillStyle='#fff';ctx.fillRect(ox,oy,trailer.width*scale,trailer.length*scale);
    ctx.strokeStyle='#111827';ctx.lineWidth=thumbnail?3:5;ctx.strokeRect(ox,oy,trailer.width*scale,trailer.length*scale);
    for(const stack of [...safeStacks].sort((a,b)=>a.y-b.y||a.x-b.x)){
      const x=ox+stack.x*scale,y=oy+stack.y*scale,w=stack.w*scale,h=stack.l*scale;
      ctx.fillStyle=stack.locked?'#dbeafe':'#d9f2e3';ctx.fillRect(x,y,w,h);
      ctx.strokeStyle='#16a34a';ctx.lineWidth=thumbnail?1.2:2.5;ctx.strokeRect(x,y,w,h);
      if(!thumbnail && w>34 && h>25){
        ctx.save();ctx.beginPath();ctx.rect(x+2,y+2,Math.max(0,w-4),Math.max(0,h-4));ctx.clip();
        ctx.fillStyle='#111827';ctx.font=`700 ${Math.max(10,Math.min(16,w/6,h/3))}px system-ui, sans-serif`;
        ctx.fillText(String(stack.name||`${stack.l}×${stack.w}`),x+5,y+18);
        ctx.font='11px system-ui, sans-serif';const layerText=Array.isArray(stack.layers)&&stack.layers.length>1?` · ${stack.layers.length} niveles`:'';ctx.fillText(`${Number(stack.qty)||0} alto · ${stack.type||''}${layerText}`,x+5,y+33);ctx.restore();
      }
    }
    if(!thumbnail){
      const fy=oy+trailer.length*scale+34;ctx.fillStyle='#111827';ctx.font='700 15px system-ui, sans-serif';ctx.fillText('NARIZ ↑',margin,fy);
      ctx.textAlign='right';ctx.fillText('PUERTAS ↓',width-margin,fy);ctx.textAlign='left';
    }
    return canvas;
  }

  function makePatternThumbnail(stacks,trailer){
    try{return createPlanCanvas(stacks,trailer,{thumbnail:true}).toDataURL('image/jpeg',0.72);}catch{return '';}
  }


  function concatBytes(parts){
    const total=parts.reduce((sum,part)=>sum+part.length,0),out=new Uint8Array(total);let offset=0;
    for(const part of parts){out.set(part,offset);offset+=part.length;}return out;
  }
  function asciiBytes(text){return new TextEncoder().encode(text);}
  function dataUrlBytes(dataUrl){
    const binary=atob(String(dataUrl).split(',')[1]||'');const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
  }
  function canvasToPdfBlob(canvas){
    const jpeg=dataUrlBytes(canvas.toDataURL('image/jpeg',0.9));
    const pageW=595,pageH=842,margin=18,maxW=pageW-margin*2,maxH=pageH-margin*2;
    const ratio=Math.min(maxW/canvas.width,maxH/canvas.height),drawW=canvas.width*ratio,drawH=canvas.height*ratio;
    const x=(pageW-drawW)/2,y=(pageH-drawH)/2;
    const content=`q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
    const objects=[];
    objects[1]=asciiBytes('<< /Type /Catalog /Pages 2 0 R >>');
    objects[2]=asciiBytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objects[3]=asciiBytes('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    objects[4]=concatBytes([asciiBytes(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,asciiBytes('\nendstream')]);
    objects[5]=asciiBytes(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const parts=[asciiBytes('%PDF-1.4\n%LM17\n')],offsets=[0];let length=parts[0].length;
    for(let i=1;i<=5;i++){offsets[i]=length;const block=concatBytes([asciiBytes(`${i} 0 obj\n`),objects[i],asciiBytes('\nendobj\n')]);parts.push(block);length+=block.length;}
    const xrefOffset=length;let xref='xref\n0 6\n0000000000 65535 f \n';
    for(let i=1;i<=5;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
    xref+=`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    parts.push(asciiBytes(xref));return new Blob([concatBytes(parts)],{type:'application/pdf'});
  }

  function canvasesToPdfBlob(canvases){
    const list=(canvases||[]).filter(Boolean);if(!list.length)throw new Error("No hay reportes seleccionados");
    const pageW=595,pageH=842,margin=18,maxW=pageW-margin*2,maxH=pageH-margin*2;
    const objects=[],pageIds=[],imageIds=[],contentIds=[];let nextId=3;
    list.forEach(()=>{pageIds.push(nextId++);imageIds.push(nextId++);contentIds.push(nextId++);});
    objects[1]=asciiBytes('<< /Type /Catalog /Pages 2 0 R >>');
    objects[2]=asciiBytes(`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${list.length} >>`);
    list.forEach((canvas,i)=>{
      const jpeg=dataUrlBytes(canvas.toDataURL('image/jpeg',0.9));
      const ratio=Math.min(maxW/canvas.width,maxH/canvas.height),drawW=canvas.width*ratio,drawH=canvas.height*ratio;
      const x=(pageW-drawW)/2,y=(pageH-drawH)/2,content=`q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im${i} Do Q`;
      objects[pageIds[i]]=asciiBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im${i} ${imageIds[i]} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`);
      objects[imageIds[i]]=concatBytes([asciiBytes(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,asciiBytes('\nendstream')]);
      objects[contentIds[i]]=asciiBytes(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });
    const parts=[asciiBytes('%PDF-1.4\n%LM20\n')],offsets=[0];let length=parts[0].length;
    for(let i=1;i<nextId;i++){offsets[i]=length;const part=concatBytes([asciiBytes(`${i} 0 obj\n`),objects[i],asciiBytes('\nendobj\n')]);parts.push(part);length+=part.length;}
    const xrefOffset=length;let xref=`xref\n0 ${nextId}\n0000000000 65535 f \n`;
    for(let i=1;i<nextId;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
    xref+=`trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;parts.push(asciiBytes(xref));return new Blob([concatBytes(parts)],{type:'application/pdf'});
  }

  const PATTERN_STORAGE_KEY = "loadmaster-visual-patterns-v1";

  class PatternMemory {
    constructor(){this.patterns=this.load();}
    load(){try{const v=JSON.parse(localStorage.getItem(PATTERN_STORAGE_KEY)||"[]");return Array.isArray(v)?v:[];}catch{return [];}}
    persist(){
      const recent=this.patterns.slice(-100);
      try{localStorage.setItem(PATTERN_STORAGE_KEY,JSON.stringify(recent));}
      catch{
        const light=recent.map(p=>({...p,thumbnail:""}));
        try{localStorage.setItem(PATTERN_STORAGE_KEY,JSON.stringify(light));this.patterns=light;}catch{}
      }
    }
    add(pattern){this.patterns.push(pattern);this.persist();return pattern;}
    update(id,changes){const index=this.patterns.findIndex(p=>p.id===id);if(index<0)return null;this.patterns[index]={...this.patterns[index],...changes,id:this.patterns[index].id,createdAt:this.patterns[index].createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};this.persist();return this.patterns[index];}
    duplicate(id){const original=this.get(id);if(!original)return null;const copy=clone(original);copy.id=uid();copy.name=`${original.name} (copia)`;copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;copy.autoComplete=false;delete copy.composition;delete copy.hits;this.patterns.push(copy);this.persist();return copy;}
    learnComplete(stacks,trailer){
      if(!Array.isArray(stacks)||!stacks.length)return null;
      const composition=[...stacks].map(s=>`${s.w}x${s.l}:${s.type||''}:${Number(s.qty)||1}`).sort().join('|');
      const existing=this.patterns.find(p=>p&&p.autoComplete&&p.composition===composition&&Math.abs(Number(p.trailer?.width)-Number(trailer.width))<EPS&&Math.abs(Number(p.trailer?.length)-Number(trailer.length))<EPS);
      if(existing){existing.hits=(existing.hits||1)+1;existing.updatedAt=new Date().toISOString();this.persist();return existing;}
      const pattern=createPattern(`Solución completa aprendida ${new Date().toLocaleString()}`,stacks,trailer,{fileName:'auto-complete'});
      pattern.autoComplete=true;pattern.composition=composition;pattern.hits=1;
      this.patterns.push(pattern);this.persist();return pattern;
    }
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
    return {id:uid(),version:2,name:name||`Patrón ${new Date().toLocaleDateString()}`,createdAt:new Date().toISOString(),trailer:{width:trailer.width,length:trailer.length},source:{fileName:source.fileName||'',fileSize:source.fileSize||0,fileType:source.fileType||''},thumbnail:makePatternThumbnail(stacks,trailer),rows:rows.map(r=>({y:r.y,length:r.length,signature:r.signature})),pieces:stacks.map(s=>({name:s.name,w:s.w,l:s.l,x:s.x,y:s.y,qty:s.qty,maxHeight:s.maxHeight,type:s.type,category:s.category,canRotate:s.canRotate!==false,rotated:!!s.rotated,stackMode:s.stackMode||"",stackLimit:s.stackLimit||null,layers:Array.isArray(s.layers)?Geometry.clone(s.layers):undefined}))};
  }

  const VISUAL_HISTORY_STORAGE_KEY = "loadmaster-visual-history-v1";
  class VisualHistoryMemory {
    constructor(){const data=this.load();this.saved=data.saved;this.recent=data.recent;}
    load(){try{const value=JSON.parse(localStorage.getItem(VISUAL_HISTORY_STORAGE_KEY)||"{}");return {saved:Array.isArray(value.saved)?value.saved:[],recent:Array.isArray(value.recent)?value.recent.slice(0,10):[]};}catch{return {saved:[],recent:[]};}}
    persist(){const payload={saved:this.saved.slice(-60),recent:this.recent.slice(0,10)};try{localStorage.setItem(VISUAL_HISTORY_STORAGE_KEY,JSON.stringify(payload));}catch{const light={saved:payload.saved.map(x=>({...x,thumbnail:""})),recent:payload.recent.map(x=>({...x,thumbnail:""}))};try{localStorage.setItem(VISUAL_HISTORY_STORAGE_KEY,JSON.stringify(light));this.saved=light.saved;this.recent=light.recent;}catch{}}}
    addSaved(entry){const item={...entry,id:entry.id||uid(),manual:true,createdAt:entry.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};this.saved.push(item);this.persist();return item;}
    addRecent(entry){const item={...entry,id:entry.id||uid(),manual:false,createdAt:entry.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};const key=item.sessionId||item.id,index=this.recent.findIndex(x=>(x.sessionId||x.id)===key);if(index>=0)this.recent.splice(index,1);this.recent.unshift(item);this.recent=this.recent.slice(0,10);this.persist();return item;}
    promote(id){const item=this.recent.find(x=>x.id===id);if(!item)return null;return this.addSaved({...clone(item),id:uid(),manual:true,name:item.name||"Carga recuperada"});}
    updateSaved(id,changes){const item=this.saved.find(x=>x.id===id);if(!item)return null;Object.assign(item,changes,{updatedAt:new Date().toISOString()});this.persist();return item;}
    removeSaved(id){this.saved=this.saved.filter(x=>x.id!==id);this.persist();}
    removeRecent(id){this.recent=this.recent.filter(x=>x.id!==id);this.persist();}
    get(id){return this.saved.find(x=>x.id===id)||this.recent.find(x=>x.id===id);}
  }

  const STRATEGY_STORAGE_KEY = "loadmaster-strategies-v2-adaptive";
  const LEGACY_STRATEGY_STORAGE_KEY = "loadmaster-strategies-v1";
  function cargoProfile(stacks,trailer){
    const counts=new Map();
    for(const s of stacks||[]){const a=Math.min(Number(s.w)||0,Number(s.l)||0),b=Math.max(Number(s.w)||0,Number(s.l)||0),key=`${a}x${b}:${s.type||''}`;counts.set(key,(counts.get(key)||0)+1);}
    return `${Number(trailer?.width)||0}x${Number(trailer?.length)||0}|${[...counts.entries()].sort().map(([k,n])=>`${k}=${n}`).join(',')}`;
  }
  function strategyConfidence(item){
    const successes=Number(item.successes)||0,failures=Number(item.failures)||0;
    return (successes+1)/(successes+failures+2);
  }
  class StrategyMemory {
    constructor(){this.allItems=this.load();this.activeProfile=null;this.items=[];}
    load(){
      try{
        let v=JSON.parse(localStorage.getItem(STRATEGY_STORAGE_KEY)||"null");
        if(!Array.isArray(v)){
          const legacy=JSON.parse(localStorage.getItem(LEGACY_STRATEGY_STORAGE_KEY)||"[]");
          v=Array.isArray(legacy)?legacy.map(x=>({...x,profile:'legacy',successes:Math.max(1,Number(x.hits)||1),failures:0,status:(Number(x.hits)||1)>=3?'trusted':'candidate'})):[];
        }
        return v.filter(x=>x&&Array.isArray(x.sequence)).map(x=>({...x,successes:Number(x.successes)||0,failures:Number(x.failures)||0,status:x.status||'candidate'}));
      }catch{return [];}
    }
    persist(){
      this.allItems=this.allItems.slice(-160);
      try{localStorage.setItem(STRATEGY_STORAGE_KEY,JSON.stringify(this.allItems));}catch{}
    }
    prepare(stacks,trailer){
      this.activeProfile=cargoProfile(stacks,trailer);
      const width=Number(trailer.width)||0;
      this.items=this.allItems.filter(x=>x.status==='trusted'&&(x.profile===this.activeProfile||x.profile==='legacy')&&Math.abs(Number(x.trailerWidth)-width)<EPS).sort((a,b)=>strategyConfidence(a)-strategyConfidence(b));
      return this.items;
    }
    makeSequence(stacks){return [...stacks].sort((a,b)=>a.y-b.y||a.x-b.x).map(s=>({w:s.w,l:s.l,type:s.type||"",rotated:!!s.rotated}));}
    learn(stacks,trailer,source="auto",context={}){
      if(!Array.isArray(stacks)||stacks.length<2)return null;
      const sequence=this.makeSequence(stacks),signature=sequence.map(s=>`${s.w}x${s.l}:${s.type}:${s.rotated?1:0}`).join("|"),profile=context.profile||this.activeProfile||cargoProfile(context.input||stacks,trailer);
      let existing=this.allItems.find(x=>x.signature===signature&&x.profile===profile&&Math.abs(Number(x.trailerWidth)-Number(trailer.width))<EPS);
      if(!existing){existing={id:uid(),signature,sequence,profile,trailerWidth:trailer.width,successes:0,failures:0,status:'candidate',source,createdAt:new Date().toISOString()};this.allItems.push(existing);}
      const success=context.success!==false;
      if(success)existing.successes=(existing.successes||0)+1;else existing.failures=(existing.failures||0)+1;
      existing.hits=(existing.successes||0);existing.source=source;existing.updatedAt=new Date().toISOString();existing.lastImprovement=Number(context.improvement)||0;
      const confidence=strategyConfidence(existing),trials=(existing.successes||0)+(existing.failures||0);
      existing.status=trials>=3&&confidence>=0.7?'trusted':'candidate';
      if(trials>=6&&confidence<0.4)existing.status='rejected';
      this.persist();return existing;
    }
    recordOutcome(input,trailer,result,source="optimización",baseline={}){
      const profile=cargoProfile(input,trailer),loaded=(result.stacks||[]).reduce((n,s)=>n+(Number(s.qty)||1),0),left=(result.unplaced||[]).reduce((n,s)=>n+(Number(s.qty)||1),0),used=Number(result.used)||Geometry.usedLength(result.stacks||[]);
      const baselineLoaded=Number(baseline.loaded)||0,baselineLeft=Number(baseline.left)||0,baselineUsed=Number(baseline.used)||Infinity;
      const improvement=(loaded-baselineLoaded)*1000+(baselineLeft-left)*500+(Number.isFinite(baselineUsed)?baselineUsed-used:0);
      const success=left===0||improvement>0;
      const learned=this.learn(result.stacks,trailer,source,{profile,input,success,improvement});
      for(const item of this.allItems){if(item===learned||item.status==='rejected'||item.profile!==profile)continue;if(Math.abs(Number(item.trailerWidth)-Number(trailer.width))>=EPS)continue;item.failures=(item.failures||0)+(success?0:1);const trials=(item.successes||0)+(item.failures||0);item.status=trials>=3&&strategyConfidence(item)>=0.7?'trusted':(trials>=6&&strategyConfidence(item)<0.4?'rejected':'candidate');}
      this.persist();this.prepare(input,trailer);return learned;
    }
    learnManual(beforeStacks,afterStacks,trailer){
      if(!Array.isArray(beforeStacks)||!Array.isArray(afterStacks)||beforeStacks.length!==afterStacks.length)return null;
      const before=calculateLoadStatistics(beforeStacks,trailer),after=calculateLoadStatistics(afterStacks,trailer),improvement=(before.usedLength-after.usedLength)+(before.deadArea-after.deadArea)/Math.max(1,Number(trailer.width)||1);
      if(improvement<=0.25)return null;
      return this.learn(afterStacks,trailer,"corrección manual",{profile:cargoProfile(beforeStacks,trailer),input:beforeStacks,success:true,improvement});
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

  function calculateLoadStatistics(stacks,trailer){
    const safeStacks=(stacks||[]).filter(s=>Number.isFinite(+s.x)&&Number.isFinite(+s.y)&&Number.isFinite(+s.w)&&Number.isFinite(+s.l)&&+s.w>0&&+s.l>0);
    const trailerWidth=+trailer.width||0,trailerLength=+trailer.length||0;
    const trailerArea=Math.max(0,trailerWidth*trailerLength);
    const usedArea=safeStacks.reduce((sum,s)=>sum+(+s.w)*(+s.l),0);
    const usedLength=safeStacks.length?Math.max(...safeStacks.map(s=>(+s.y)+(+s.l))):0;
    const envelopeArea=Math.max(0,trailerWidth*usedLength);
    const deadArea=Math.max(0,envelopeArea-usedArea);
    const totalFreeArea=Math.max(0,trailerArea-usedArea);
    const utilization=trailerArea?Math.min(100,usedArea/trailerArea*100):0;
    const efficiency=envelopeArea?Math.min(100,usedArea/envelopeArea*100):0;
    const maxHeight=safeStacks.reduce((m,s)=>Math.max(m,+s.qty||0),0);
    const remainingLength=Math.max(0,trailerLength-usedLength);
    let gapCount=0;
    if(safeStacks.length&&usedLength>0){
      const xs=[0,trailerWidth],ys=[0,usedLength];
      safeStacks.forEach(s=>{xs.push(+s.x,(+s.x)+(+s.w));ys.push(+s.y,(+s.y)+(+s.l));});
      const ux=[...new Set(xs.map(v=>Math.max(0,Math.min(trailerWidth,Math.round(v*1000)/1000))))].sort((a,b)=>a-b);
      const uy=[...new Set(ys.map(v=>Math.max(0,Math.min(usedLength,Math.round(v*1000)/1000))))].sort((a,b)=>a-b);
      const cols=Math.max(0,ux.length-1),rows=Math.max(0,uy.length-1);
      if(cols&&rows&&cols*rows<120000){
        const free=Array.from({length:rows},()=>Array(cols).fill(false));
        for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
          const cx=(ux[c]+ux[c+1])/2,cy=(uy[r]+uy[r+1])/2;
          free[r][c]=!safeStacks.some(s=>cx>=+s.x-EPS&&cx<=(+s.x)+(+s.w)+EPS&&cy>=+s.y-EPS&&cy<=(+s.y)+(+s.l)+EPS);
        }
        const seen=Array.from({length:rows},()=>Array(cols).fill(false)),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
        for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
          if(!free[r][c]||seen[r][c])continue;
          let touches=false,area=0;const q=[[r,c]];seen[r][c]=true;
          while(q.length){const [rr,cc]=q.pop();area+=(ux[cc+1]-ux[cc])*(uy[rr+1]-uy[rr]);if(cc===0||cc===cols-1||rr===0||rr===rows-1)touches=true;for(const [dr,dc] of dirs){const nr=rr+dr,nc=cc+dc;if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&free[nr][nc]&&!seen[nr][nc]){seen[nr][nc]=true;q.push([nr,nc]);}}}
          if(!touches&&area>1)gapCount++;
        }
      }
    }
    return {trailerArea,usedArea,totalFreeArea,usedLength,envelopeArea,deadArea,utilization,efficiency,maxHeight,remainingLength,gapCount};
  }

  function calculateEfficiencyIndicator(stacks,pending,trailer){
    const stats=calculateLoadStatistics(stacks,trailer);
    const loaded=(stacks||[]).reduce((n,s)=>n+(Number(s.qty)||1),0),left=(pending||[]).reduce((n,s)=>n+(Number(s.qty)||1),0);
    const completion=(loaded+left)?loaded/(loaded+left)*100:0;
    const deadRatio=stats.envelopeArea?stats.deadArea/stats.envelopeArea*100:0;
    const compactness=Math.max(0,100-deadRatio-Math.min(35,stats.gapCount*3));
    const score=stacks.length?Math.max(0,Math.min(100,stats.efficiency*.58+completion*.32+compactness*.10)):0;
    let label='Baja',tone='bad';if(score>=95){label='Excelente';tone='excellent';}else if(score>=85){label='Muy buena';tone='good';}else if(score>=70){label='Buena';tone='warn';}else if(score>=50){label='Mejorable';tone='warn';}
    const reasons=[];if(left)reasons.push(`${left} pallet${left===1?'':'s'} pendiente${left===1?'':'s'}`);if(stats.gapCount)reasons.push(`${stats.gapCount} hueco${stats.gapCount===1?'':'s'} interno${stats.gapCount===1?'':'s'}`);if(deadRatio>2)reasons.push(`${deadRatio.toFixed(1)}% de espacio muerto en el largo usado`);if(!reasons.length&&score<99.9)reasons.push('todavía existe espacio libre dentro del largo utilizado');
    return {...stats,score,label,tone,completion,loaded,left,reasons};
  }


  function fileToDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(reader.error||new Error("No se pudo leer la imagen"));reader.readAsDataURL(file);});}
  async function resizeImageDataUrl(file,maxSide=1600){
    const source=await fileToDataUrl(file),img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error("Imagen no válida"));img.src=source;});
    const ratio=Math.min(1,maxSide/Math.max(img.naturalWidth||1,img.naturalHeight||1)),w=Math.max(1,Math.round(img.naturalWidth*ratio)),h=Math.max(1,Math.round(img.naturalHeight*ratio));
    const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,w,h);return canvas.toDataURL("image/jpeg",.86);
  }
  function extractResponseText(data){
    if(typeof data?.output_text==="string")return data.output_text;
    const parts=[];for(const out of data?.output||[]){for(const c of out?.content||[]){if(typeof c?.text==="string")parts.push(c.text);if(typeof c?.output_text==="string")parts.push(c.output_text);}}
    return parts.join("\n");
  }
  function parsePhotoLoadJson(text){
    const cleaned=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");
    let parsed;try{parsed=JSON.parse(cleaned);}catch{const start=cleaned.indexOf("{"),end=cleaned.lastIndexOf("}");if(start<0||end<=start)throw new Error("La IA no devolvió datos estructurados");parsed=JSON.parse(cleaned.slice(start,end+1));}
    const rows=Array.isArray(parsed)?parsed:Array.isArray(parsed.items)?parsed.items:[];
    return rows.map((raw,i)=>{const length=Number(raw.length??raw.largo??raw.l??0),width=Number(raw.width??raw.ancho??raw.w??0),quantity=Math.max(1,Math.round(Number(raw.quantity??raw.cantidad??raw.qty??1)||1)),maxHeight=Math.max(1,Math.round(Number(raw.maxHeight??raw.max_por_pila??raw.altura??raw.stackMax??quantity)||quantity));let type=String(raw.type??raw.tipo??"4-way").toLowerCase();type=type.includes("2")?"2-way":"4-way";return {id:uid(),name:String(raw.name??raw.nombre??`${length||"?"}×${width||"?"}`).trim()||`Fila ${i+1}`,quantity,length,width,maxHeight,type,canRotate:raw.canRotate!==false&&raw.giro!==false&&type==="4-way",category:String(raw.category??raw.categoria??"Otra"),notes:String(raw.notes??raw.notas??""),confidence:Math.max(0,Math.min(1,Number(raw.confidence??raw.confianza??.5)||.5))};}).filter(x=>x.length>0&&x.width>0&&x.quantity>0);
  }

  function libraryMaxHeightFor(stack,library=[]){
    const explicit=Number(stack?.maxHeight||stack?.stackMax||stack?.alturaMaxima||0);
    if(explicit>0)return Math.max(explicit,Number(stack?.qty)||1);
    const sw=Number(stack?.w)||0,sl=Number(stack?.l)||0,name=String(stack?.name||'').trim().toLowerCase();
    const match=(library||[]).find(item=>{
      const direct=Math.abs((Number(item.w)||0)-sw)<EPS&&Math.abs((Number(item.l)||0)-sl)<EPS;
      const rotated=Math.abs((Number(item.w)||0)-sl)<EPS&&Math.abs((Number(item.l)||0)-sw)<EPS;
      return (direct||rotated)&&(name?String(item.name||'').trim().toLowerCase()===name:true);
    })||(library||[]).find(item=>{
      const direct=Math.abs((Number(item.w)||0)-sw)<EPS&&Math.abs((Number(item.l)||0)-sl)<EPS;
      const rotated=Math.abs((Number(item.w)||0)-sl)<EPS&&Math.abs((Number(item.l)||0)-sw)<EPS;
      return direct||rotated;
    });
    return Math.max(Number(match?.maxHeight)||0,Number(stack?.qty)||1);
  }
  function stackLayersFor(stack,library=[]){
    if(Array.isArray(stack?.layers)&&stack.layers.length)return stack.layers.map(layer=>({...Geometry.clone(layer),qty:Math.max(1,Number(layer.qty)||1),maxHeight:Math.max(1,Number(layer.maxHeight)||libraryMaxHeightFor(layer,library))}));
    return [{id:stack.id,name:stack.name,w:Number(stack.w),l:Number(stack.l),qty:Math.max(1,Number(stack.qty)||1),maxHeight:libraryMaxHeightFor(stack,library),type:stack.type||'4-way',canRotate:stack.canRotate!==false,category:stack.category||'Otra'}];
  }
  function topSupportFor(stack,library=[]){const layers=stackLayersFor(stack,library),top=layers[layers.length-1];return {w:Number(top.w),l:Number(top.l),layers};}
  function fitUpperOrientation(upper,support){
    const options=[{w:Number(upper.w),l:Number(upper.l),rotated:false}];
    if(upper.canRotate!==false&&upper.type==='4-way'&&Math.abs(Number(upper.w)-Number(upper.l))>EPS)options.push({w:Number(upper.l),l:Number(upper.w),rotated:true});
    return options.filter(o=>o.w<=support.w+EPS&&o.l<=support.l+EPS).sort((a,b)=>(support.w*support.l-a.w*a.l)-(support.w*support.l-b.w*b.l))[0]||null;
  }

  function originalStackGroups(placedInput,pendingInput,library=[]){
    const groups=new Map();
    const add=(raw,qtyOverride=null)=>{
      const qty=Math.max(1,Math.round(Number(qtyOverride??raw.qty)||1));
      let w=Number(raw.w)||0,l=Number(raw.l)||0;
      const name=String(raw.name||`${w}×${l}`);
      const lib=(library||[]).find(item=>String(item.name||'').trim().toLowerCase()===name.trim().toLowerCase()&&(
        (Math.abs((Number(item.w)||0)-w)<EPS&&Math.abs((Number(item.l)||0)-l)<EPS)||
        (Math.abs((Number(item.w)||0)-l)<EPS&&Math.abs((Number(item.l)||0)-w)<EPS)
      ))||(library||[]).find(item=>(Math.abs((Number(item.w)||0)-w)<EPS&&Math.abs((Number(item.l)||0)-l)<EPS)||(Math.abs((Number(item.w)||0)-l)<EPS&&Math.abs((Number(item.l)||0)-w)<EPS));
      if(lib){w=Number(lib.w)||w;l=Number(lib.l)||l;}
      const type=raw.type||lib?.type||'4-way',canRotate=raw.canRotate!==false&&(lib?.canRotate!==false)&&type==='4-way';
      const maxHeight=Math.max(1,Math.round(Number(raw.maxHeight||lib?.maxHeight||qty)||qty));
      const category=raw.category||lib?.category||'Otra';
      const key=[name,w,l,maxHeight,type,canRotate?1:0,category].join('|');
      if(!groups.has(key))groups.set(key,{key,name,w,l,maxHeight,type,canRotate,category,notes:raw.notes||lib?.notes||'',qty:0});
      groups.get(key).qty+=qty;
    };
    for(const stack of [...(placedInput||[]),...(pendingInput||[])]){
      if(Array.isArray(stack.layers)&&stack.layers.length){for(const layer of stack.layers)add(layer,layer.qty);}else add(stack);
    }
    return [...groups.values()].filter(g=>g.w>0&&g.l>0&&g.qty>0);
  }
  function upperFitsBase(upper,base){
    const opts=[{w:upper.w,l:upper.l,rotated:false}];
    if(upper.canRotate&&Math.abs(upper.w-upper.l)>EPS)opts.push({w:upper.l,l:upper.w,rotated:true});
    return opts.filter(o=>o.w<=base.w+EPS&&o.l<=base.l+EPS).sort((a,b)=>(base.w*base.l-a.w*a.l)-(base.w*base.l-b.w*b.l))[0]||null;
  }
  function buildStackingFirstLoad(placedInput,pendingInput,library=[],profile='balanced'){
    const groups=originalStackGroups(placedInput,pendingInput,library).map(g=>({...g,remaining:g.qty}));
    const mixed=[];
    const upperOrder=[...groups].sort((a,b)=>a.w*a.l-b.w*b.l||a.maxHeight-b.maxHeight);
    let guard=0;
    while(guard++<500){
      let choice=null;
      for(const upper of upperOrder){
        if(upper.remaining<=0)continue;
        for(const base of groups){
          if(base===upper||base.remaining<=0||base.w*base.l+EPS<upper.w*upper.l)continue;
          const orientation=upperFitsBase(upper,base);if(!orientation)continue;
          const limit=Math.min(base.maxHeight,upper.maxHeight);if(limit<2)continue;
          const waste=base.w*base.l-orientation.w*orientation.l;
          const score=(profile==='tight'?waste:0)+(profile==='large-base'?-base.w*base.l*.001:0)+(profile==='small-first'?upper.w*upper.l*.001:0);
          if(!choice||score<choice.score)choice={base,upper,orientation,limit,score};
        }
      }
      if(!choice)break;
      const {base,upper,orientation,limit}=choice;
      let desiredUpper;
      if(profile==='upper-heavy')desiredUpper=limit-1;
      else if(profile==='base-heavy')desiredUpper=Math.max(1,Math.floor(limit/3));
      else desiredUpper=Math.max(1,Math.floor(limit/2));
      let upperQty=Math.min(upper.remaining,desiredUpper,limit-1);
      let baseQty=Math.min(base.remaining,limit-upperQty);
      if(baseQty<1){baseQty=1;upperQty=Math.min(upper.remaining,limit-1);}
      if(baseQty+upperQty<2||baseQty>base.remaining||upperQty<1)break;
      base.remaining-=baseQty;upper.remaining-=upperQty;
      mixed.push({
        id:uid(),name:`${base.name} + ${upper.name}`,w:base.w,l:base.l,qty:baseQty+upperQty,maxHeight:limit,
        type:base.type,category:base.category,canRotate:false,locked:false,rotated:false,stackMode:'mixed',stackLimit:limit,mixedStacking:true,
        layers:[
          {id:uid(),sourceKey:base.key,name:base.name,w:base.w,l:base.l,qty:baseQty,maxHeight:base.maxHeight,type:base.type,canRotate:base.canRotate,category:base.category},
          {id:uid(),sourceKey:upper.key,name:upper.name,w:orientation.w,l:orientation.l,qty:upperQty,maxHeight:upper.maxHeight,type:upper.type,canRotate:upper.canRotate,category:upper.category,rotated:orientation.rotated}
        ],x:0,y:0
      });
    }
    const normals=[];
    for(const g of groups){
      let n=g.remaining;
      while(n>0){const take=Math.min(n,g.maxHeight);normals.push({id:uid(),name:g.name,w:g.w,l:g.l,qty:take,maxHeight:g.maxHeight,type:g.type,category:g.category,canRotate:g.canRotate,locked:false,rotated:false,x:0,y:0});n-=take;}
    }
    return [...mixed,...normals];
  }
  function mixedStackingPlan(placedInput,pendingInput,library=[],trailer={width:96,length:628}){
    const placed=Geometry.clone(placedInput||[]),pending=Geometry.clone(pendingInput||[]);
    const actions=[];
    const applyLayer=(base,source,take,orientation)=>{
      const layers=stackLayersFor(base,library),sourceMax=libraryMaxHeightFor(source,library);
      const limit=Math.min(...layers.map(x=>Math.max(1,Number(x.maxHeight)||1)),sourceMax);
      const current=layers.reduce((n,x)=>n+(Number(x.qty)||1),0);
      if(take<=0||current+take>limit)return false;
      layers.push({id:`${source.id||uid()}-layer-${layers.length+1}`,sourceId:source.id,name:source.name,w:orientation.w,l:orientation.l,qty:take,maxHeight:sourceMax,type:source.type||'4-way',canRotate:source.canRotate!==false,category:source.category||'Otra',rotated:orientation.rotated});
      base.layers=layers;base.qty=current+take;base.maxHeight=limit;base.stackMode='mixed';base.stackLimit=limit;base.mixedStacking=true;
      actions.push({type:'stack',baseId:base.id,upperId:source.id,upperName:source.name,baseName:base.name,qty:take,total:base.qty,limit});
      return true;
    };
    // Primero coloca directamente las pendientes sobre bases existentes. Las piezas pequeñas se intentan primero.
    const order=[...pending].sort((a,b)=>a.w*a.l-b.w*b.l||a.qty-b.qty);
    const residual=[];
    for(const source of order){
      let remaining=Math.max(1,Number(source.qty)||1);
      while(remaining>0){
        const options=[];
        for(const base of placed){
          if(base.locked)continue;
          const support=topSupportFor(base,library),orientation=fitUpperOrientation(source,support);
          if(!orientation)continue;
          const limit=Math.min(...support.layers.map(x=>Math.max(1,Number(x.maxHeight)||1)),libraryMaxHeightFor(source,library));
          const current=support.layers.reduce((n,x)=>n+(Number(x.qty)||1),0),capacity=Math.max(0,limit-current);
          if(capacity<=0)continue;
          options.push({base,orientation,capacity,waste:support.w*support.l-orientation.w*orientation.l});
        }
        options.sort((a,b)=>a.waste-b.waste||b.capacity-a.capacity||a.base.y-b.base.y);
        const best=options[0];if(!best)break;
        const take=Math.min(remaining,best.capacity);if(!applyLayer(best.base,source,take,best.orientation))break;remaining-=take;
      }
      if(remaining>0)residual.push({...source,qty:remaining});
    }
    // Segundo intento: mover una pila pequeña del piso sobre otra para liberar su lugar a una pendiente.
    let changed=true,guard=0;
    while(changed&&residual.length&&guard++<12){
      changed=false;
      outer:for(let pi=0;pi<residual.length;pi++){
        const source=residual[pi];
        for(let ui=0;ui<placed.length;ui++){
          const upper=placed[ui];if(upper.locked||upper.stackMode==='mixed')continue;
          for(let bi=0;bi<placed.length;bi++){
            const base=placed[bi];if(base.id===upper.id||base.locked)continue;
            const support=topSupportFor(base,library),upperOrientation=fitUpperOrientation(upper,support);if(!upperOrientation)continue;
            const layers=stackLayersFor(base,library),limit=Math.min(...layers.map(x=>x.maxHeight),libraryMaxHeightFor(upper,library));
            const current=layers.reduce((n,x)=>n+x.qty,0),upperQty=Math.max(1,Number(upper.qty)||1);if(current+upperQty>limit)continue;
            const floorOptions=[{w:source.w,l:source.l,rotated:false},...(source.canRotate!==false&&source.type==='4-way'&&source.w!==source.l?[{w:source.l,l:source.w,rotated:true}]:[])];
            for(const floorOrientation of floorOptions){
              const replacement={...source,w:floorOrientation.w,l:floorOrientation.l,x:upper.x,y:upper.y,rotated:floorOrientation.rotated,qty:Math.max(1,Number(source.qty)||1),maxHeight:libraryMaxHeightFor(source,library)};
              const withoutUpper=placed.filter(x=>x.id!==upper.id);
              if(!Geometry.valid(replacement,withoutUpper,trailer))continue;
              if(!applyLayer(base,upper,upperQty,upperOrientation))continue;
              placed.splice(ui,1);placed.push(replacement);residual.splice(pi,1);
              actions.push({type:'relocate',movedName:upper.name,newFloorName:source.name});changed=true;break outer;
            }
          }
        }
      }
    }
    const check=validateLayout(placed,trailer);
    return {ok:check.ok,stacks:check.ok?placed:Geometry.clone(placedInput||[]),pending:check.ok?residual:Geometry.clone(pendingInput||[]),actions,stackedPallets:actions.filter(a=>a.type==='stack').reduce((n,a)=>n+a.qty,0),freedPositions:actions.filter(a=>a.type==='relocate').length,validation:check};
  }

  class App {
    constructor(){
      this.store=new Store(); this.patternMemory=new PatternMemory(); this.strategyMemory=new StrategyMemory(); this.visualHistory=new VisualHistoryMemory(); this.installPrompt=null; this.lastSolutions=[]; this.referenceImage=null; this.editingPatternId=null; this.lastOptimizationMs=0; this.lastWinningStrategy="Manual / sin optimizar"; this.currentOptimizationSessionId=null; this.selectedHistoryIds=new Set(); this.manualEditMode=false; this.progressiveSession=null; this.pendingProgressiveImprovement=null; this.photoReaderFile=null; this.photoReaderDataUrl=""; this.photoReaderItems=[]; this.lastStackingResult=null; this.autoArrangeOnAdd=localStorage.getItem("lm_auto_arrange_on_add")!=="0";
      this.bind(); this.syncTrailerInputs(); this.restoreAccordionState(); this.render();
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
      $("trailerPreset").onchange=e=>{const v=PRESETS[e.target.value];if(v){$("trailerWidth").value=v[0];$("trailerLength").value=v[1];$("trailerAutofillStatus").textContent=`✓ Tráiler autocompletado: ${v[1]} largo × ${v[0]} ancho`;this.updateTrailerSummary(v[0],v[1]);}};
      this.bindAccordion();
      $("applyTrailer").onclick=()=>{this.store.remember();this.state.trailer={width:+$("trailerWidth").value||96,length:+$("trailerLength").value||628};this.updateTrailerSummary();this.render();};
      $("librarySelect").onchange=()=>this.loadLibrarySelection();
      $("saveLibrary").onclick=()=>this.saveLibraryItem();
      $("newCatalogItem").onclick=()=>this.openCatalogEditor();
      $("catalogSearch").oninput=()=>this.renderLibrary();
      $("editCatalogSelected").onclick=()=>{const id=$("catalogManageSelect").value;if(!id)return this.toast("Selecciona un pallet guardado");this.openCatalogEditor(id);};
      $("duplicateCatalogSelected").onclick=()=>{const id=$("catalogManageSelect").value;if(!id)return this.toast("Selecciona un pallet guardado");this.duplicateCatalogItem(id);};
      $("deleteCatalogSelected").onclick=()=>{const id=$("catalogManageSelect").value;if(!id)return this.toast("Selecciona un pallet guardado");this.deleteCatalogItem(id);};
      $("exportCatalog").onclick=()=>this.exportCatalog();
      $("importCatalog").onclick=()=>$("catalogImportInput").click();
      $("catalogImportInput").onchange=e=>this.importCatalog(e);
      $("saveCatalogEdit").onclick=e=>{e.preventDefault();this.saveCatalogEditor();};
      $("addPallet").onclick=()=>this.addPallets();
      if($("autoArrangeOnAdd")){ $("autoArrangeOnAdd").checked=this.autoArrangeOnAdd; $("autoArrangeOnAdd").onchange=e=>{this.autoArrangeOnAdd=!!e.target.checked;localStorage.setItem("lm_auto_arrange_on_add",this.autoArrangeOnAdd?"1":"0");this.toast(this.autoArrangeOnAdd?"Autoacomodo al agregar activado":"Autoacomodo al agregar desactivado");}; }
      $("rotateBtn").onclick=()=>this.rotateSelected(); $("floatRotateBtn").onclick=()=>this.rotateSelected();
      $("lockBtn").onclick=()=>this.toggleLock(); $("floatLockBtn").onclick=()=>this.toggleLock();
      $("duplicateBtn").onclick=()=>this.duplicateSelected();
      $("deleteBtn").onclick=()=>this.deleteSelected(); $("floatDeleteBtn").onclick=()=>this.deleteSelected();
      $("undoBtn").onclick=()=>this.undo(); $("redoBtn").onclick=()=>this.redo();
      $("compactBtn").onclick=()=>this.compact(); $("stackAssistBtn").onclick=()=>this.searchMixedStacking(); $("optimizeBtn").onclick=()=>this.optimize(); $("retryOptimizeBtn").onclick=()=>this.optimize();
      $("clearBtn").onclick=()=>{if(!this.state.stacks.length)return;this.store.remember();this.state.stacks=[];this.state.selectedId=null;this.render();};
      $("demoBtn").onclick=()=>this.demo();
      $("saveLoadBtn").onclick=()=>this.saveFile(); $("openLoadBtn").onclick=()=>$("fileInput").click();
      $("saveImageBtn").onclick=()=>this.saveImage(); $("saveReportBtn").onclick=()=>this.saveProfessionalPdf(); $("shareReportBtn").onclick=()=>this.shareProfessionalReport();
      $("fileInput").onchange=e=>this.openFile(e); $("printBtn").onclick=()=>window.print();
      $("closeOptimizer").onclick=()=>$("optimizerPanel").hidden=true;$("stopProgressiveBtn").onclick=()=>this.stopProgressiveOptimization();$("applyProgressiveBtn").onclick=()=>this.applyProgressiveImprovement();$("ignoreProgressiveBtn").onclick=()=>this.ignoreProgressiveImprovement();$("compareProgressiveBtn").onclick=()=>this.compareProgressiveImprovement();$("retryPendingBtn").onclick=()=>this.retryPending();$("clearPendingBtn").onclick=()=>this.clearPending();
      $("scanCameraBtn").onclick=()=>this.openPhotoPicker("camera"); $("scanGalleryBtn").onclick=()=>this.openPhotoPicker("gallery");
      $("scanCameraInput").onchange=e=>this.loadPhotoForReading(e); $("scanGalleryInput").onchange=e=>this.loadPhotoForReading(e);
      $("closePhotoReader").onclick=()=>$("photoReaderDialog").close(); $("cancelPhotoImportBtn").onclick=()=>$("photoReaderDialog").close();
      $("analyzePhotoBtn").onclick=()=>this.analyzeLoadPhoto(); $("addPhotoRowBtn").onclick=()=>{this.photoReaderItems.push({id:uid(),name:"Pallet",quantity:1,length:40,width:48,maxHeight:13,type:"4-way",canRotate:true,category:"Otra",notes:"",confidence:1});this.renderPhotoReview();};
      $("confirmPhotoImportBtn").onclick=()=>this.confirmPhotoImport();
      $("referenceImageInput").onchange=e=>this.loadReferenceImage(e);
      $("learnPatternBtn").onclick=()=>this.learnCurrentPattern();
      $("cancelPatternEdit").onclick=()=>this.cancelPatternEdit(); $("clearInternalLearning").onclick=()=>this.clearInternalLearning(); $("saveHistoryBtn").onclick=()=>this.saveCurrentToHistory();
      ["historySearch","historyDateFrom","historyDateTo","historyStatusFilter","historySort","historyFavoritesOnly"].forEach(id=>{const el=$(id);if(el)el.addEventListener(id==="historyFavoritesOnly"?"change":"input",()=>this.renderVisualHistory());});
      $("compareHistoryBtn").onclick=()=>this.compareSelectedHistory();$("exportHistoryPdfBtn").onclick=()=>this.exportSelectedHistoryPdf();$("exportHistoryCsvBtn").onclick=()=>this.exportSelectedHistoryCsv();$("deleteHistorySelectedBtn").onclick=()=>this.deleteSelectedHistory();$("closeComparisonBtn").onclick=()=>{$("comparisonPanel").hidden=true;};
      $("analyzePatternBtn").onclick=()=>this.analyzeCurrentRows();
      $("trailer").onclick=e=>{if(e.target===$("trailer")||e.target.classList.contains("freeZone")){this.state.selectedId=null;this.render();}};
      $("manualModeBtn").onclick=()=>this.setManualEditMode(true);
      $("finishManualBtn").onclick=()=>this.setManualEditMode(false);
    }

    accordionPanels(){return [$("trailerSettings"),$("catalogPanel"),$("historyPanel")].filter(Boolean);}
    bindAccordion(){
      this.accordionPanels().forEach(panel=>panel.addEventListener("toggle",()=>{
        if(this.syncingAccordion)return;
        if(panel.open){
          this.syncingAccordion=true;
          this.accordionPanels().forEach(other=>{if(other!==panel)other.open=false;});
          this.syncingAccordion=false;
          localStorage.setItem("lm_sidebar_accordion_open",panel.id);
        }else if(localStorage.getItem("lm_sidebar_accordion_open")===panel.id){
          localStorage.removeItem("lm_sidebar_accordion_open");
        }
      }));
    }
    restoreAccordionState(){
      const id=localStorage.getItem("lm_sidebar_accordion_open");
      this.syncingAccordion=true;
      this.accordionPanels().forEach(panel=>panel.open=!!id&&panel.id===id);
      this.syncingAccordion=false;
      this.updateTrailerSummary();this.updateCatalogSummary();this.updateHistorySummary();
    }
    updateTrailerSummary(width=this.state.trailer.width,length=this.state.trailer.length){const el=$("trailerSummary");if(el)el.textContent=`${Number(width)||0} × ${Number(length)||0} pulg.`;}
    updateCatalogSummary(){const el=$("catalogSummary");if(el){const n=this.state.library.length;el.textContent=`${n} medida${n===1?"":"s"} guardada${n===1?"":"s"}`;}}
    updateHistorySummary(){const el=$("historySummary");if(el){const saved=this.visualHistory.saved.length,recent=this.visualHistory.recent.length;el.textContent=(saved||recent)?`${saved} guardada${saved===1?"":"s"} · ${recent} reciente${recent===1?"":"s"}`:"Sin registros";}}


    openPhotoPicker(source="gallery"){
      if(!navigator.onLine)return this.toast("La lectura desde foto requiere Internet. Agrega la carga manualmente.");
      const input=source==="camera"?$("scanCameraInput"):$("scanGalleryInput");input.value="";input.click();
    }
    async loadPhotoForReading(e){
      const file=e.target.files?.[0];if(!file)return;
      if(!navigator.onLine){e.target.value="";return this.toast("Sin Internet: agrega la carga manualmente");}
      if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>15*1024*1024){e.target.value="";return this.toast("Usa JPG, PNG o WebP de hasta 15 MB");}
      try{this.photoReaderFile=file;this.photoReaderDataUrl=await resizeImageDataUrl(file);this.photoReaderItems=[]; this.lastStackingResult=null; this.autoArrangeOnAdd=localStorage.getItem("lm_auto_arrange_on_add")!=="0";const preview=$("photoPreview");preview.innerHTML="";const img=document.createElement("img");img.src=this.photoReaderDataUrl;img.alt="Orden seleccionada";preview.appendChild(img);$("photoReaderStatus").textContent=`Imagen lista: ${file.name}`;$("photoReaderHelp").textContent="Configura la clave de API para analizarla. Los datos no se agregan hasta que los confirmes.";$("photoReviewSection").hidden=true;$("analyzePhotoBtn").disabled=false;$("visionApiKey").value=sessionStorage.getItem("lm_vision_api_key")||"";$("visionModel").value=sessionStorage.getItem("lm_vision_model")||"gpt-5.6";$("photoReaderDialog").showModal();}catch(err){this.toast(err.message||"No se pudo abrir la imagen");}
    }
    async analyzeLoadPhoto(){
      if(!navigator.onLine)return this.toast("La lectura desde foto requiere Internet");
      if(!this.photoReaderDataUrl)return this.toast("Selecciona una fotografía");
      const key=$("visionApiKey").value.trim(),model=$("visionModel").value.trim()||"gpt-5.6";if(!key)return this.toast("Escribe una clave de API para esta sesión");
      sessionStorage.setItem("lm_vision_api_key",key);sessionStorage.setItem("lm_vision_model",model);const btn=$("analyzePhotoBtn");btn.disabled=true;$("photoReaderStatus").textContent="Analizando la orden…";$("photoReaderHelp").textContent="Busca cantidades, dimensiones, altura máxima y tipo de acceso.";
      const prompt=`Analiza esta fotografía de una orden de pallets. Extrae todas las filas de carga. Devuelve SOLO JSON válido con esta forma exacta: {"items":[{"name":"nombre o código","quantity":1,"length":42,"width":42,"maxHeight":13,"type":"2-way o 4-way","canRotate":true,"category":"Otra","notes":"restricciones relevantes","confidence":0.95}]}. Usa pulgadas. quantity es la cantidad total de pallets; maxHeight es el máximo de pallets por pila. Si la orden dice 2-way, canRotate debe ser false salvo indicación explícita. No inventes valores ilegibles: usa confidence baja y explica la duda en notes. Omite filas sin dimensiones utilizables.`;
      try{
        const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify({model,input:[{role:"user",content:[{type:"input_text",text:prompt},{type:"input_image",image_url:this.photoReaderDataUrl,detail:"high"}]}],max_output_tokens:2200})});
        const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error?.message||`Error del servicio (${response.status})`);const text=extractResponseText(data);this.photoReaderItems=parsePhotoLoadJson(text);if(!this.photoReaderItems.length)throw new Error("No se detectaron filas con medidas completas");this.renderPhotoReview();$("photoReviewSection").hidden=false;$("photoReaderStatus").textContent=`${this.photoReaderItems.length} fila${this.photoReaderItems.length===1?"":"s"} detectada${this.photoReaderItems.length===1?"":"s"}`;$("photoReaderHelp").textContent="Revisa los datos marcados con baja confianza antes de agregarlos.";
      }catch(err){$("photoReaderStatus").textContent="No se pudo analizar la fotografía";$("photoReaderHelp").textContent=err.message||"Comprueba la conexión y la clave de API.";this.toast(err.message||"Error al leer la fotografía");}finally{btn.disabled=false;}
    }
    renderPhotoReview(){
      const body=$("photoReviewBody");body.innerHTML="";this.photoReaderItems.forEach((item,index)=>{const tr=document.createElement("tr");if(item.confidence<.65)tr.classList.add("lowConfidence");tr.innerHTML=`<td><input data-field="name" type="text"></td><td><input data-field="quantity" min="1" type="number"></td><td><input data-field="length" min="1" type="number"></td><td><input data-field="width" min="1" type="number"></td><td><input data-field="maxHeight" min="1" type="number"></td><td><select data-field="type"><option value="4-way">4-way</option><option value="2-way">2-way</option></select></td><td><input data-field="canRotate" type="checkbox"></td><td><span class="confidenceBadge"></span></td><td><button data-remove type="button">×</button></td>`;for(const input of tr.querySelectorAll("[data-field]")){const field=input.dataset.field;if(input.type==="checkbox")input.checked=!!item[field];else input.value=item[field]??"";input.oninput=()=>{item[field]=input.type==="checkbox"?input.checked:(input.type==="number"?Number(input.value):input.value);if(field==="type"&&input.value==="2-way"){item.canRotate=false;tr.querySelector('[data-field="canRotate"]').checked=false;}};}tr.querySelector(".confidenceBadge").textContent=`${Math.round(item.confidence*100)}%`;tr.querySelector("[data-remove]").onclick=()=>{this.photoReaderItems.splice(index,1);this.renderPhotoReview();};body.appendChild(tr);});
    }
    confirmPhotoImport(){
      const items=this.photoReaderItems.map(x=>({...x,quantity:Math.max(1,Math.round(Number(x.quantity)||0)),length:Number(x.length)||0,width:Number(x.width)||0,maxHeight:Math.max(1,Math.round(Number(x.maxHeight)||0))})).filter(x=>x.length>0&&x.width>0&&x.quantity>0&&x.maxHeight>0);if(!items.length)return this.toast("No hay filas válidas para agregar");
      this.store.remember();let palletsAdded=0;const created=[];for(const item of items){const base={name:item.name||`${item.length}×${item.width}`,w:item.width,l:item.length,type:item.type==="2-way"?"2-way":"4-way",category:item.category||"Otra",canRotate:item.type!=="2-way"&&item.canRotate!==false,locked:false,rotated:false,maxHeight:item.maxHeight};this.splitQty(item.quantity,item.maxHeight).forEach(n=>{created.push({...base,id:uid(),qty:n,x:0,y:0});palletsAdded+=n;});}
      const result=this.addNewStacksWithSoftArrange(created);this.state.selectedId=null;this.render();$("photoReaderDialog").close();this.toast(`${palletsAdded} pallets agregados: ${result.placed} pilas acomodadas${result.pending?` y ${result.pending} pendientes`:''}.`);
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
      if(!this.state.stacks.length)return this.toast("No hay un acomodo para guardar");
      const validation=validateLayout(this.state.stacks,this.state.trailer);
      if(!validation.ok)return this.toast(`Corrige la carga antes de guardar: ${explainValidation(validation)}`);
      const name=$("patternName").value.trim()||`Patrón ${this.patternMemory.patterns.length+1}`;
      const source=this.referenceImage||{};const fresh=createPattern(name,this.state.stacks,this.state.trailer,source);
      if(this.editingPatternId){
        const current=this.patternMemory.get(this.editingPatternId);
        if(!current){this.cancelPatternEdit();return this.toast("El patrón que editabas ya no existe");}
        const pattern=this.patternMemory.update(this.editingPatternId,{...fresh,id:current.id,createdAt:current.createdAt,autoComplete:false});
        this.cancelPatternEdit(false);this.renderPatterns();
        return this.toast(`Patrón actualizado: ${pattern.name}`);
      }
      const pattern=this.patternMemory.add(fresh);$("patternName").value="";this.renderPatterns();
      this.toast(`Patrón guardado: ${pattern.rows.map(r=>r.signature).filter(Boolean).join(" / ")||pattern.pieces.length+" pilas"}`);
    }
    editPattern(id){
      const pattern=this.patternMemory.get(id);if(!pattern)return this.toast("No se encontró el patrón");
      this.store.remember();this.state.trailer={width:Number(pattern.trailer?.width)||this.state.trailer.width,length:Number(pattern.trailer?.length)||this.state.trailer.length};
      this.state.stacks=(pattern.pieces||[]).map(piece=>({id:uid(),name:piece.name||"Pallet",w:Number(piece.w),l:Number(piece.l),x:Number(piece.x)||0,y:Number(piece.y)||0,qty:Number(piece.qty)||1,type:piece.type||"4-way",category:piece.category||"Pallet",canRotate:piece.canRotate!==false,rotated:!!piece.rotated,locked:false}));
      this.state.pending=[];this.state.selectedId=null;this.editingPatternId=id;$("patternName").value=pattern.name||"";$("learnPatternBtn").textContent="Actualizar patrón";$("cancelPatternEdit").hidden=false;$("patternEditStatus").hidden=false;$("patternEditStatus").textContent=`Editando: ${pattern.name}. Mueve las pilas o cambia el nombre y toca “Actualizar patrón”.`;this.syncTrailerInputs();this.render();this.toast("Patrón cargado para editar");
      document.querySelector('.visualLearningCard')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
    cancelPatternEdit(clearName=true){
      this.editingPatternId=null;$("learnPatternBtn").textContent="Guardar patrón";$("cancelPatternEdit").hidden=true;$("patternEditStatus").hidden=true;$("patternEditStatus").textContent="";if(clearName)$("patternName").value="";
    }
    duplicatePattern(id){const copy=this.patternMemory.duplicate(id);if(!copy)return this.toast("No se pudo duplicar el patrón");this.renderPatterns();this.toast(`Patrón duplicado: ${copy.name}`);}
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
    clearInternalLearning(){
      const patternCount=this.patternMemory.patterns.filter(p=>p&&p.autoComplete).length,strategyCount=this.strategyMemory.allItems.length,count=patternCount+strategyCount;
      if(!count)return this.toast("No hay aprendizaje interno guardado");
      if(!confirm(`Configuración avanzada: se eliminarán ${patternCount} soluciones aprendidas y ${strategyCount} estrategias internas. Tus patrones e historial manual se conservarán. ¿Continuar?`))return;
      if(!confirm("Última confirmación: esta acción no se puede deshacer. ¿Restablecer el aprendizaje interno?"))return;
      this.patternMemory.patterns=this.patternMemory.patterns.filter(p=>!p.autoComplete);this.patternMemory.persist();this.strategyMemory.allItems=[];this.strategyMemory.items=[];this.strategyMemory.persist();this.toast("Aprendizaje interno restablecido");
    }
    deletePattern(id){const pattern=this.patternMemory.get(id);if(!pattern)return;if(!confirm(`¿Eliminar el patrón “${pattern.name}”?`))return;this.patternMemory.remove(id);if(this.editingPatternId===id)this.cancelPatternEdit();this.renderPatterns();this.toast("Patrón eliminado");}
    renderPatterns(){
      const root=$("patternList");if(!root)return;const visible=this.patternMemory.patterns.filter(p=>p&&!p.autoComplete);$("patternCount").textContent=visible.length;root.innerHTML="";
      [...visible].reverse().forEach(pattern=>{
        const item=document.createElement("div");item.className="patternItem";const sig=(pattern.rows||[]).map(r=>r.signature).filter(Boolean).join(" / ");
        const preview=pattern.thumbnail?`<img class="patternThumb" alt="Vista previa del patrón">`:`<span class="patternThumbPlaceholder">Sin vista<br>previa</span>`;
        item.innerHTML=`${preview}<div><strong></strong><small></small></div><span class="patternActions"><button type="button" data-use>Usar</button><button type="button" data-edit>Editar</button><button type="button" data-duplicate>Duplicar</button><button type="button" data-delete>Eliminar</button></span>`;
        if(pattern.thumbnail)item.querySelector("img").src=pattern.thumbnail;
        item.querySelector("strong").textContent=pattern.name;item.querySelector("small").textContent=`${(pattern.pieces||[]).length} pilas · ${sig||"patrón libre"}${pattern.source?.fileName?" · captura: "+pattern.source.fileName:""}${pattern.updatedAt?" · editado":""}`;
        item.querySelector("[data-use]").onclick=()=>this.applyPattern(pattern.id);item.querySelector("[data-edit]").onclick=()=>this.editPattern(pattern.id);item.querySelector("[data-duplicate]").onclick=()=>this.duplicatePattern(pattern.id);item.querySelector("[data-delete]").onclick=()=>this.deletePattern(pattern.id);root.appendChild(item);
      });
      if(!visible.length)root.innerHTML='<div class="patternDetected">Todavía no hay patrones confirmados.</div>';
    }
    loadLibrarySelection(){
      const index=this.state.library.findIndex(x=>String(x.id)===String($("librarySelect").value));if(index<0)return;
      const item=normalizeLibraryItem(this.state.library[index]);this.state.library[index]=item;this.store.persistLibrary();
      const status=$("libraryAutofillStatus");
      if(!(item.w>0&&item.l>0)){$("palletWidth").value="";$("palletLength").value="";status.textContent="⚠ Esta medida guardada no contiene largo y ancho válidos.";this.toast("La medida guardada necesita largo y ancho");return;}
      $("palletWidth").value=item.w;$("palletLength").value=item.l;$("maxHeight").value=item.maxHeight;$("palletType").value=item.type;$("category").value=item.category;$("canRotate").checked=item.canRotate;$("palletName").value=item.name;status.textContent=`✓ Pallet autocompletado: ${item.l} largo × ${item.w} ancho · altura ${item.maxHeight}`;this.toast("Pallet autocompletado");
    }
    saveLibraryItem(){
      const selectedId=$("librarySelect").value;
      const existing=this.state.library.find(x=>String(x.id)===String(selectedId));
      const item=normalizeLibraryItem({id:existing?.id||uid(),name:$("palletName").value.trim()||"Pallet",w:+$("palletWidth").value,l:+$("palletLength").value,maxHeight:+$("maxHeight").value,type:$("palletType").value,category:$("category").value,canRotate:$("canRotate").checked,favorite:existing?.favorite||false,notes:existing?.notes||""});
      if(!(item.w>0&&item.l>0&&item.maxHeight>0))return this.toast("Revisa largo, ancho y altura");
      if(existing){Object.assign(existing,item);this.toast("Medida actualizada");}
      else{this.state.library.push(item);this.toast("Medida guardada");}
      this.store.persistLibrary();this.renderLibrary();this.renderCatalog();$("librarySelect").value=item.id;
    }
    openCatalogEditor(id=""){
      const item=id?this.state.library.find(x=>String(x.id)===String(id)):null;
      $("catalogDialogTitle").textContent=item?"Editar pallet":"Nuevo pallet";$("catalogEditId").value=item?.id||"";
      $("catalogName").value=item?.name||"";$("catalogLength").value=item?.l||"";$("catalogWidth").value=item?.w||"";$("catalogMaxHeight").value=item?.maxHeight||20;
      $("catalogType").value=item?.type||"4-way";$("catalogCategory").value=item?.category||"Otra";$("catalogNotes").value=item?.notes||"";$("catalogCanRotate").checked=item?.canRotate!==false;$("catalogFavorite").checked=!!item?.favorite;
      $("catalogDialog").showModal();
    }
    saveCatalogEditor(){
      const id=$("catalogEditId").value;const current=this.state.library.find(x=>String(x.id)===String(id));
      const item=normalizeLibraryItem({id:current?.id||uid(),name:$("catalogName").value.trim()||"Pallet",l:+$("catalogLength").value,w:+$("catalogWidth").value,maxHeight:+$("catalogMaxHeight").value,type:$("catalogType").value,category:$("catalogCategory").value.trim()||"Otra",notes:$("catalogNotes").value.trim(),canRotate:$("catalogCanRotate").checked,favorite:$("catalogFavorite").checked});
      if(!(item.l>0&&item.w>0&&item.maxHeight>0))return this.toast("Revisa largo, ancho y altura");
      if(current)Object.assign(current,item);else this.state.library.push(item);
      this.store.persistLibrary();this.renderLibrary();this.renderCatalog();$("catalogDialog").close();this.toast(current?"Pallet actualizado":"Pallet creado");
    }
    duplicateCatalogItem(id){const source=this.state.library.find(x=>String(x.id)===String(id));if(!source)return;const copy=normalizeLibraryItem({...clone(source),id:uid(),name:`${source.name} copia`,favorite:false});this.state.library.push(copy);this.store.persistLibrary();this.renderLibrary();this.renderCatalog();this.toast("Pallet duplicado");}
    deleteCatalogItem(id){const item=this.state.library.find(x=>String(x.id)===String(id));if(!item)return;if(!confirm(`¿Eliminar “${item.name}” del catálogo? Los archivos y patrones ya guardados conservarán sus propios datos.`))return;this.state.library=this.state.library.filter(x=>String(x.id)!==String(id));this.store.persistLibrary();this.renderLibrary();this.renderCatalog();this.toast("Pallet eliminado");}
    toggleCatalogFavorite(id){const item=this.state.library.find(x=>String(x.id)===String(id));if(!item)return;item.favorite=!item.favorite;this.store.persistLibrary();this.renderLibrary();this.renderCatalog();}
    exportCatalog(){const blob=new Blob([JSON.stringify({version:"5.38",type:"loadmaster-pallet-catalog",library:this.state.library},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="loadmaster-catalogo-pallets.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);this.toast("Catálogo exportado");}
    async importCatalog(e){const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());const incoming=Array.isArray(data)?data:data.library;if(!Array.isArray(incoming))throw new Error();const normalized=incoming.map(normalizeLibraryItem).filter(x=>x.w>0&&x.l>0);const byKey=new Map(this.state.library.map(x=>[`${x.name}|${x.l}|${x.w}`,x]));for(const item of normalized){const key=`${item.name}|${item.l}|${item.w}`;if(byKey.has(key))Object.assign(byKey.get(key),item,{id:byKey.get(key).id});else this.state.library.push({...item,id:uid()});}this.store.persistLibrary();this.renderLibrary();this.renderCatalog();this.toast(`${normalized.length} pallets importados o actualizados`);}catch{this.toast("Catálogo no válido");}e.target.value="";}
    renderCatalog(){this.renderLibrary();}


    placementCandidates(stacks,trailer){
      const xs=new Set([0]),ys=new Set([0]);
      for(const s of stacks||[]){xs.add(Math.max(0,Number(s.x)||0));xs.add(Math.max(0,(Number(s.x)||0)+(Number(s.w)||0)));ys.add(Math.max(0,Number(s.y)||0));ys.add(Math.max(0,(Number(s.y)||0)+(Number(s.l)||0)));}
      return {xs:[...xs].filter(x=>x<=trailer.width+EPS).sort((a,b)=>a-b),ys:[...ys].filter(y=>y<=trailer.length+EPS).sort((a,b)=>a-b)};
    }
    findSoftPlacement(raw,existing=this.state.stacks){
      const trailer=this.state.trailer,base=clone(raw),orientations=[{w:Number(base.w),l:Number(base.l),rotated:!!base.rotated}];
      if(base.type==='4-way'&&base.canRotate!==false&&Math.abs(Number(base.w)-Number(base.l))>EPS)orientations.push({w:Number(base.l),l:Number(base.w),rotated:!base.rotated});
      const {xs,ys}=this.placementCandidates(existing,trailer);let best=null;
      for(const o of orientations){for(const y of ys){if(y+o.l>trailer.length+EPS)continue;for(const x of xs){if(x+o.w>trailer.width+EPS)continue;const c={...base,x,y,w:o.w,l:o.l,rotated:o.rotated};if(!Geometry.valid(c,existing,trailer,c.id)){continue;}const score=y*10000+x*10+(o.rotated?1:0);if(!best||score<best.score)best={stack:c,score};}}}
      return best?.stack||null;
    }
    addNewStacksWithSoftArrange(stacks){
      this.lastSolutions=[];this.lastOptimizationMs=0;this.lastWinningStrategy="Manual / sin optimizar";
      let placed=0,pending=0;this.state.pending=this.state.pending||[];
      for(const raw of stacks){const stack={...clone(raw),id:raw.id||uid()};const spot=this.autoArrangeOnAdd?this.findSoftPlacement(stack,this.state.stacks):null;if(spot){this.state.stacks.push(spot);placed++;}else if(this.autoArrangeOnAdd){this.state.pending.push({...stack,x:0,y:0});pending++;}else{stack.x=Math.max(0,Math.min(this.state.trailer.width-stack.w,4));stack.y=Math.max(0,Geometry.usedLength(this.state.stacks)+2);this.state.stacks.push(stack);placed++;}}
      return {placed,pending};
    }
    splitQty(total,max){const r=[];while(total>0){const n=Math.min(total,max);r.push(n);total-=n;}return r;}
    addPallets(){
      const w=+$("palletWidth").value,l=+$("palletLength").value,qty=+$("palletQty").value,max=+$("maxHeight").value;
      if(!(w>0&&l>0&&qty>0&&max>0)){this.toast("Revisa las medidas y cantidades");return;}
      this.store.remember();
      const base={name:$("palletName").value.trim()||`${w}×${l}`,w,l,type:$("palletType").value,category:$("category").value,canRotate:$("canRotate").checked,locked:false,rotated:false,maxHeight:max};
      const created=this.splitQty(qty,max).map(n=>({...base,id:uid(),qty:n,x:0,y:0}));const result=this.addNewStacksWithSoftArrange(created);this.state.selectedId=null;this.render();
      if(result.pending)this.toast(`${result.placed} pilas autoacomodadas; ${result.pending} quedaron pendientes`);else this.toast(this.autoArrangeOnAdd?`${result.placed} pilas autoacomodadas`:`${result.placed} pilas agregadas`);
    }
    rotateSelected(){const s=this.selected();if(!s)return this.toast("Selecciona una pila");if(s.locked)return this.toast("La pila está bloqueada");if(Array.isArray(s.layers)&&s.layers.length>1)return this.toast("Una pila mixta no se gira como bloque; sepárala antes de cambiar su orientación");if(s.type!=="4-way"||!s.canRotate)return this.toast("Esta pila no puede girarse");this.store.remember();[s.w,s.l]=[s.l,s.w];s.rotated=!s.rotated;this.render();}
    toggleLock(){const s=this.selected();if(!s)return this.toast("Selecciona una pila");this.store.remember();s.locked=!s.locked;this.render();}
    duplicateSelected(){const s=this.selected();if(!s)return this.toast("Selecciona una pila");this.store.remember();const c={...clone(s),id:uid(),x:s.x+2,y:s.y+s.l+2,locked:false};this.state.stacks.push(c);this.state.selectedId=c.id;this.render();}
    deleteSelected(){const s=this.selected();if(!s)return this.toast("Selecciona una pila");this.store.remember();this.state.stacks=this.state.stacks.filter(x=>x.id!==s.id);this.state.selectedId=null;this.render();}
    undo(){if(!this.store.history.length)return;this.store.future.push(this.store.snapshot());this.store.restore(this.store.history.pop());this.syncTrailerInputs();this.render();}
    redo(){if(!this.store.future.length)return;this.store.history.push(this.store.snapshot());this.store.restore(this.store.future.pop());this.syncTrailerInputs();this.render();}
    prepareMixedStacksBeforeOptimization(){
      const allCargo=[...(this.state.stacks||[]),...(this.state.pending||[])];
      if(!allCargo.length)return this.toast("Agrega pallets antes de preparar el apilamiento");
      const profiles=['tight','balanced','upper-heavy','base-heavy','large-base'];
      const totalPallets=allCargo.reduce((n,s)=>n+(Number(s.qty)||1),0);
      const candidates=[];
      for(const profile of profiles){
        const input=buildStackingFirstLoad(this.state.stacks||[],this.state.pending||[],this.state.library,profile);
        const mixedCount=input.filter(s=>Array.isArray(s.layers)&&s.layers.length>1).length;
        const checkTotal=input.reduce((n,s)=>n+(Number(s.qty)||1),0);
        if(!mixedCount||checkTotal!==totalPallets)continue;
        const footprint=input.reduce((n,s)=>n+Number(s.w||0)*Number(s.l||0),0);
        candidates.push({profile,input,mixedCount,score:input.length*1e6+footprint});
      }
      candidates.sort((a,b)=>a.score-b.score||b.mixedCount-a.mixedCount);
      const best=candidates[0];
      if(!best)return this.toast("No se encontraron combinaciones compatibles para apilar");
      const placed=[],pending=[];
      const ordered=[...best.input].sort((a,b)=>b.w*b.l-a.w*a.l||b.qty-a.qty);
      for(const raw of ordered){
        const stack={...clone(raw),id:raw.id||uid()};
        const spot=this.findSoftPlacement(stack,placed);
        if(spot)placed.push(spot);else pending.push({...stack,x:0,y:0});
      }
      const loaded=placed.reduce((n,s)=>n+(Number(s.qty)||1),0),left=totalPallets-loaded;
      this.store.remember();
      this.state.stacks=placed;this.state.pending=pending;this.state.selectedId=null;
      this.lastSolutions=[];this.lastOptimizationMs=0;this.lastWinningStrategy='Pilas mixtas preparadas · sin optimizar';
      this.lastStackingResult={name:`Preparación previa · ${best.profile}`,family:'Apilamiento previo manual',stacks:clone(placed),unplaced:clone(pending),mixedCount:best.mixedCount};
      this.render();
      const status=$("stackingStatus");
      if(status)status.textContent=left?`Se prepararon ${best.mixedCount} pilas mixtas antes de optimizar; ${left} pallets esperan acomodo.`:`Se prepararon ${best.mixedCount} pilas mixtas. Ahora puedes pulsar Optimización IA.`;
      this.toast(`Apilamiento preparado: ${best.mixedCount} pila${best.mixedCount===1?'':'s'} mixta${best.mixedCount===1?'':'s'}`);
    }
    async searchMixedStacking(){
      const hasCargo=(this.state.stacks||[]).length||(this.state.pending||[]).length;
      if(!hasCargo)return this.toast("Agrega pallets antes de buscar apilamiento");
      const hasOptimizedPlan=Array.isArray(this.lastSolutions)&&this.lastSolutions.length>0;
      if(!hasOptimizedPlan)return this.prepareMixedStacksBeforeOptimization();
      if(!(this.state.pending||[]).length)return this.toast("La carga ya está completa; no hay pendientes para apilar");
      if(!this.state.stacks.length)return this.toast("No hay una base acomodada para aprovechar capacidad vertical");
      if(this.progressiveSession)this.stopProgressiveOptimization(true);
      const before=clone({stacks:this.state.stacks,pending:this.state.pending,selectedId:this.state.selectedId});
      const baselinePallets=before.stacks.reduce((n,s)=>n+(Number(s.qty)||1),0);
      const totalPallets=baselinePallets+before.pending.reduce((n,s)=>n+(Number(s.qty)||1),0);
      const status=$("stackingStatus"),button=$("stackAssistBtn");
      if(button)button.disabled=true;
      if(status)status.textContent="Formando pilas compatibles antes de volver a acomodar…";
      this.toast("Buscando una solución que primero apile y después acomode");
      await new Promise(resolve=>setTimeout(resolve,40));
      try{
        if(status)status.textContent="Revisando capacidad vertical disponible en las pilas actuales…";
        const direct=mixedStackingPlan(before.stacks,before.pending,this.state.library,this.state.trailer);
        const directLoaded=direct.ok?direct.stacks.reduce((n,s)=>n+(Number(s.qty)||1),0):baselinePallets;
        if(direct.ok&&directLoaded>baselinePallets){
          const validation=validateLayout(direct.stacks,this.state.trailer);if(!validation.ok)throw new Error(explainValidation(validation));
          this.store.remember();this.state.stacks=clone(direct.stacks);this.state.pending=clone(direct.pending||[]);this.state.selectedId=null;this.lastStackingResult={...direct,name:'Capacidad vertical disponible',family:'Apilamiento directo'};this.lastWinningStrategy='Capacidad vertical disponible';this.lastOptimizationMs=0;this.render();
          const gained=directLoaded-baselinePallets,left=totalPallets-directLoaded;if(status)status.textContent=left?`Se aprovecharon ${gained} espacios verticales; quedan ${left} pallets pendientes.`:`Carga completa aprovechando capacidad vertical.`;this.toast(`Apilamiento aplicado sin mover el piso: ${gained} pallets adicionales`);return;
        }
        const profiles=['tight','balanced','upper-heavy','base-heavy','large-base'];
        const candidates=[];
        for(let i=0;i<profiles.length;i++){
          if(status)status.textContent=`Probando apilamiento ${i+1} de ${profiles.length}…`;
          await new Promise(resolve=>setTimeout(resolve,25));
          const input=buildStackingFirstLoad(before.stacks,before.pending,this.state.library,profiles[i]);
          const mixedCount=input.filter(s=>Array.isArray(s.layers)&&s.layers.length>1).length;
          if(!mixedCount)continue;
          const engine=new LoadEngine(this.state.trailer,{timeLimitMs:Math.max(2200,Math.floor(11500/profiles.length)),patterns:[],strategies:[]});
          const report=engine.optimize(clone(input));
          if(!report.ok)continue;
          for(const sol of (report.solutions||[]).slice(0,2)){
            if(!validateLayout(sol.stacks,this.state.trailer).ok)continue;
            candidates.push({...sol,name:`Apilar primero · ${profiles[i]}`,family:'Apilamiento previo',stackingProfile:profiles[i],mixedCount});
          }
        }
        candidates.sort((a,b)=>(b.loadedPallets||0)-(a.loadedPallets||0)||(b.loadedStacks||0)-(a.loadedStacks||0)||(a.unplacedPallets||0)-(b.unplacedPallets||0)||(a.used||Infinity)-(b.used||Infinity));
        const best=candidates[0];
        if(!best||(best.loadedPallets||0)<=baselinePallets){
          this.state.stacks=before.stacks;this.state.pending=before.pending;this.state.selectedId=before.selectedId;this.render();
          if(status)status.textContent="El acomodo normal sigue siendo mejor; no se cambió el plano.";
          return this.toast("El apilamiento previo no logró cargar más pallets; se conservó el plano normal");
        }
        const validation=validateLayout(best.stacks,this.state.trailer);
        if(!validation.ok)throw new Error(explainValidation(validation));
        this.store.remember();this.state.stacks=clone(best.stacks);this.state.pending=clone(best.unplaced||[]);this.state.selectedId=null;
        this.lastStackingResult=best;this.lastWinningStrategy='Apilamiento previo + optimización';this.lastOptimizationMs=0;this.render();
        const gained=(best.loadedPallets||0)-baselinePallets,left=totalPallets-(best.loadedPallets||0);
        if(status)status.textContent=left?`El apilamiento previo agregó ${gained} pallets; quedan ${left} pendientes.`:`Carga completa mediante apilamiento previo.`;
        this.toast(`Apilamiento previo aplicado: ${gained} pallet${gained===1?'':'s'} adicional${gained===1?'':'es'}`);
      }catch(error){
        this.state.stacks=before.stacks;this.state.pending=before.pending;this.state.selectedId=before.selectedId;this.render();
        if(status)status.textContent="El apilamiento fue rechazado y el plano normal se conservó.";
        this.toast(`No se pudo completar el apilamiento: ${error?.message||'error desconocido'}`);
      }finally{if(button)button.disabled=!((this.state.stacks||[]).length||(this.state.pending||[]).length);}
    }

    renderPending(){
      const root=$("pendingList"),count=$("pendingCount");if(!root||!count)return;
      const pending=this.state.pending||[];count.textContent=pending.length;root.innerHTML="";const stackBtn=$("stackAssistBtn");if(stackBtn)stackBtn.disabled=!((this.state.stacks||[]).length||pending.length);
      if(!pending.length){root.innerHTML='<div class="pendingEmpty">No hay pilas pendientes.</div>';const status=$("stackingStatus");if(status)status.textContent="El apilamiento solo se ejecuta cuando tú pulsas “Buscar apilamiento”.";return;}
      pending.forEach(s=>{const row=document.createElement("div");row.className="pendingItem";row.innerHTML=`<div><strong>${s.name}</strong><small>${s.w}×${s.l} · ${s.qty||1} pallets · máx ${libraryMaxHeightFor(s,this.state.library)} · ${s.type}</small></div><button type="button" data-edit>Editar</button>`;row.querySelector("[data-edit]").onclick=()=>this.editPending(s.id);root.appendChild(row);});
    }
    editPending(id){
      const s=(this.state.pending||[]).find(x=>x.id===id);if(!s)return;
      $("palletWidth").value=s.w;$("palletLength").value=s.l;$("palletQty").value=s.qty||1;$("maxHeight").value=s.maxHeight||s.qty||1;$("palletType").value=s.type||"4-way";$("category").value=s.category||"New";$("canRotate").checked=s.canRotate!==false;$("palletName").value=s.name||`${s.w}×${s.l}`;
      this.store.remember();this.state.pending=this.state.pending.filter(x=>x.id!==id);this.renderPending();this.toast("Pila pendiente cargada en el formulario; edítala y pulsa Crear pilas");
    }
    retryPending(){
      if(!(this.state.pending||[]).length)return this.toast("No hay pilas pendientes");
      const start=Geometry.usedLength(this.state.stacks)+2;this.store.remember();
      this.state.pending.forEach((s,i)=>this.state.stacks.push({...clone(s),x:Math.max(0,Math.min(this.state.trailer.width-s.w,(i%2)*(s.w+2))),y:start+i*2}));
      this.state.pending=[];this.render();this.toast("Pendientes devueltas a la carga para reintentar");
    }
    clearPending(){if(!(this.state.pending||[]).length)return;this.store.remember();this.state.pending=[];this.renderPending();this.toast("Carga pendiente eliminada");}

    createHistoryEntry(name,{sessionId=null}={}){
      const stats=calculateEfficiencyIndicator(this.state.stacks,this.state.pending,this.state.trailer);
      return {id:uid(),sessionId,name:name||`Carga ${new Date().toLocaleString("es-MX")}`,createdAt:new Date().toISOString(),trailer:clone(this.state.trailer),stacks:clone(this.state.stacks),pending:clone(this.state.pending||[]),thumbnail:this.state.stacks.length?makePatternThumbnail(this.state.stacks,this.state.trailer):"",stats:{score:stats.score,utilization:stats.utilization,usedLength:stats.usedLength,loaded:stats.loaded,left:stats.left},optimizationMs:this.lastOptimizationMs||0,strategy:this.lastWinningStrategy||"Manual / sin optimizar"};
    }
    saveCurrentToHistory(){if(!this.state.stacks.length)return this.toast("No hay una carga para guardar en el historial");const validation=validateLayout(this.state.stacks,this.state.trailer);if(!validation.ok)return this.toast(`Corrige la carga antes de guardarla: ${explainValidation(validation)}`);const name=$("historyName").value.trim()||`Carga ${new Date().toLocaleString("es-MX")}`;this.visualHistory.addSaved(this.createHistoryEntry(name));$("historyName").value="";this.renderVisualHistory();this.toast("Carga guardada en el historial");}
    recordRecentOptimization(){if(!this.state.stacks.length)return;const sessionId=this.currentOptimizationSessionId||uid(),name=`Optimización ${new Date().toLocaleString("es-MX")}`;this.visualHistory.addRecent(this.createHistoryEntry(name,{sessionId}));this.renderVisualHistory();}
    openHistoryEntry(id){const entry=this.visualHistory.get(id);if(!entry)return this.toast("No se encontró la carga del historial");this.store.remember();this.state.trailer=clone(entry.trailer);this.state.stacks=clone(entry.stacks||[]).map(s=>({...s,id:s.id||uid()}));this.state.pending=clone(entry.pending||[]).map(s=>({...s,id:s.id||uid()}));this.state.selectedId=null;this.lastOptimizationMs=entry.optimizationMs||0;this.lastWinningStrategy=entry.strategy||"Historial";this.syncTrailerInputs();this.render();this.toast("Carga recuperada del historial");}
    saveRecentAsPermanent(id){const saved=this.visualHistory.promote(id);if(!saved)return this.toast("No se pudo guardar esta optimización");this.renderVisualHistory();this.toast("Optimización guardada permanentemente");}
    renameHistoryEntry(id){const entry=this.visualHistory.saved.find(x=>x.id===id);if(!entry)return;const name=prompt("Nuevo nombre para la carga:",entry.name||"");if(name===null)return;const clean=name.trim();if(!clean)return this.toast("Escribe un nombre válido");this.visualHistory.updateSaved(id,{name:clean});this.renderVisualHistory();}
    toggleHistoryFavorite(id){const entry=this.visualHistory.saved.find(x=>x.id===id);if(!entry)return;this.visualHistory.updateSaved(id,{favorite:!entry.favorite});this.renderVisualHistory();}
    deleteHistoryEntry(id,isRecent=false){const entry=this.visualHistory.get(id);if(!entry)return;if(!confirm(`¿Eliminar “${entry.name}” del historial?`))return;if(isRecent)this.visualHistory.removeRecent(id);else this.visualHistory.removeSaved(id);this.renderVisualHistory();this.toast("Registro eliminado");}
    historyAllEntries(){return [...this.visualHistory.saved,...this.visualHistory.recent];}
    getSelectedHistoryEntries(){return [...this.selectedHistoryIds].map(id=>this.visualHistory.get(id)).filter(Boolean);}
    toggleHistorySelection(id,checked){if(checked)this.selectedHistoryIds.add(id);else this.selectedHistoryIds.delete(id);this.updateHistorySelectionToolbar();}
    updateHistorySelectionToolbar(){for(const id of [...this.selectedHistoryIds])if(!this.visualHistory.get(id))this.selectedHistoryIds.delete(id);const count=this.selectedHistoryIds.size;$('historySelectedCount').textContent=String(count);$('compareHistoryBtn').disabled=count!==2;$('exportHistoryPdfBtn').disabled=count<1;$('exportHistoryCsvBtn').disabled=count<1;$('deleteHistorySelectedBtn').disabled=count<1;}
    filterAndSortHistory(items,isRecent=false){
      const q=($('historySearch').value||'').trim().toLowerCase(),from=$('historyDateFrom').value,to=$('historyDateTo').value,status=$('historyStatusFilter').value,onlyFav=$('historyFavoritesOnly').checked,sort=$('historySort').value;
      let out=[...items].filter(entry=>{const date=new Date(entry.updatedAt||entry.createdAt),dateKey=Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10),left=Number(entry.stats?.left)||0,text=`${entry.name||''} ${entry.strategy||''} ${entry.trailer?.width||''}x${entry.trailer?.length||''}`.toLowerCase();return (!q||text.includes(q))&&(!from||dateKey>=from)&&(!to||dateKey<=to)&&(status==='all'||(status==='complete'?left===0:left>0))&&(!onlyFav||!!entry.favorite);});
      const num=(e,k)=>Number(e.stats?.[k])||0;
      out.sort((a,b)=>{if(sort==='efficiency')return num(b,'score')-num(a,'score');if(sort==='pallets')return num(b,'loaded')-num(a,'loaded');if(sort==='time')return (Number(a.optimizationMs)||Infinity)-(Number(b.optimizationMs)||Infinity);if(sort==='name')return String(a.name||'').localeCompare(String(b.name||''),'es');return String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt));});
      if(!isRecent)out.sort((a,b)=>Number(!!b.favorite)-Number(!!a.favorite)||0);return out;
    }
    renderVisualHistory(){
      const renderList=(root,items,isRecent)=>{root.innerHTML='';const ordered=this.filterAndSortHistory(items,isRecent);if(!ordered.length){root.innerHTML=`<div class="historyEmpty">${isRecent?'No hay optimizaciones recientes que coincidan con los filtros.':'No hay cargas guardadas que coincidan con los filtros.'}</div>`;return;}ordered.forEach(entry=>{const item=document.createElement('article');item.className='historyItem';const img=entry.thumbnail?`<img class="historyThumb" alt="Vista previa de la carga">`:`<div class="historyThumb historyEmpty">Sin vista</div>`;const score=Number(entry.stats?.score)||0,loaded=Number(entry.stats?.loaded)||0,left=Number(entry.stats?.left)||0,date=new Date(entry.updatedAt||entry.createdAt).toLocaleString('es-MX'),checked=this.selectedHistoryIds.has(entry.id)?'checked':'';item.innerHTML=`<label class="historySelect"><input data-select type="checkbox" ${checked}><span>Seleccionar</span></label>${img}<div class="historyMeta"><div class="historyTitleRow"><strong></strong><span class="historyBadge ${left?'pending':'complete'}">${left?`${left} pendientes`:'Completa'}</span></div><small>${date}</small><small>${loaded} pallets dentro · ${score.toFixed(1)}% eficiencia · ${(Number(entry.stats?.usedLength)||0).toFixed(1)}" usados</small><small>${entry.strategy||'Manual'} · ${entry.optimizationMs?`${(entry.optimizationMs/1000).toFixed(1)} s`:'sin tiempo registrado'}</small><div class="historyActions"><button data-open type="button">Abrir</button>${isRecent?'<button data-save type="button">Guardar</button>':'<button data-rename type="button">Renombrar</button><button data-favorite type="button"></button>'}<button data-report type="button">PDF</button><button data-delete type="button">Eliminar</button></div></div>`;if(entry.thumbnail)item.querySelector('img').src=entry.thumbnail;item.querySelector('strong').textContent=`${entry.favorite?'★ ':''}${entry.name||'Carga'}`;item.querySelector('[data-select]').onchange=e=>this.toggleHistorySelection(entry.id,e.target.checked);item.querySelector('[data-open]').onclick=()=>this.openHistoryEntry(entry.id);item.querySelector('[data-report]').onclick=()=>this.exportHistoryEntriesPdf([entry]);item.querySelector('[data-delete]').onclick=()=>this.deleteHistoryEntry(entry.id,isRecent);if(isRecent)item.querySelector('[data-save]').onclick=()=>this.saveRecentAsPermanent(entry.id);else{item.querySelector('[data-rename]').onclick=()=>this.renameHistoryEntry(entry.id);const fav=item.querySelector('[data-favorite]');fav.textContent=entry.favorite?'Quitar favorito':'Favorito';fav.classList.toggle('historyFavorite',!!entry.favorite);fav.onclick=()=>this.toggleHistoryFavorite(entry.id);}root.appendChild(item);});};
      const saved=this.filterAndSortHistory(this.visualHistory.saved,false),recent=this.filterAndSortHistory(this.visualHistory.recent,true);$('savedHistoryCount').textContent=`(${saved.length})`;$('recentHistoryCount').textContent=`(${recent.length})`;renderList($('savedHistoryList'),this.visualHistory.saved,false);renderList($('recentHistoryList'),this.visualHistory.recent,true);this.updateHistorySelectionToolbar();this.updateHistorySummary();
    }
    createHistoryReportCanvas(entry){
      const stacks=entry.stacks||[],pending=entry.pending||[],trailer=entry.trailer||{width:96,length:628},info=calculateEfficiencyIndicator(stacks,pending,trailer),canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;const ctx=canvas.getContext('2d');ctx.fillStyle='#f3f4f6';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#111827';ctx.fillRect(0,0,canvas.width,170);ctx.fillStyle='#fff';ctx.font='700 46px system-ui, sans-serif';ctx.fillText('LOADMASTER AI',70,72);ctx.font='23px system-ui, sans-serif';ctx.fillText(entry.name||'Reporte de carga',70,118);ctx.textAlign='right';ctx.font='19px system-ui, sans-serif';ctx.fillText(new Date(entry.updatedAt||entry.createdAt).toLocaleString('es-MX'),1170,94);ctx.textAlign='left';ctx.fillStyle='#fff';ctx.strokeStyle='#d1d5db';ctx.lineWidth=2;ctx.fillRect(55,205,1130,300);ctx.strokeRect(55,205,1130,300);ctx.fillStyle='#111827';ctx.font='700 31px system-ui, sans-serif';ctx.fillText(`Eficiencia ${info.score.toFixed(1)}% · ${info.label}`,85,260);ctx.font='21px system-ui, sans-serif';const rows=[[`Tráiler`,`${trailer.length}" × ${trailer.width}"`],[`Carga`,`${stacks.length} pilas · ${info.loaded} pallets`],[`Pendientes`,`${info.left}`],[`Ocupación`,`${info.utilization.toFixed(1)}%`],[`Área usada`,`${Math.round(info.usedArea).toLocaleString('es-MX')} in²`],[`Largo usado`,`${info.usedLength.toFixed(1)}"`],[`Tiempo`,entry.optimizationMs?`${(entry.optimizationMs/1000).toFixed(1)} s`:'—'],[`Estrategia`,entry.strategy||'Manual']];rows.forEach((row,i)=>{const col=i%2,x=85+col*555,y=310+Math.floor(i/2)*48;ctx.fillStyle='#6b7280';ctx.fillText(`${row[0]}:`,x,y);ctx.fillStyle='#111827';ctx.fillText(String(row[1]),x+190,y);});const plan=createPlanCanvas(stacks,trailer,{title:'Plano de carga'}),maxW=1080,maxH=1120,scale=Math.min(maxW/plan.width,maxH/plan.height),w=plan.width*scale,h=plan.height*scale,x=(canvas.width-w)/2,y=555+(maxH-h)/2;ctx.fillStyle='#fff';ctx.fillRect(55,535,1130,1160);ctx.strokeStyle='#d1d5db';ctx.strokeRect(55,535,1130,1160);ctx.drawImage(plan,x,y,w,h);ctx.fillStyle='#6b7280';ctx.font='17px system-ui, sans-serif';ctx.textAlign='center';ctx.fillText('Reporte automático del historial · LoadMaster AI v5.38',620,1730);return canvas;
    }
    exportHistoryEntriesPdf(entries){try{const valid=(entries||[]).slice(0,10);if(!valid.length)return this.toast('Selecciona al menos una carga');const blob=canvasesToPdfBlob(valid.map(e=>this.createHistoryReportCanvas(e))),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`loadmaster-reportes-${new Date().toISOString().slice(0,10)}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1800);this.toast(`${valid.length} reporte${valid.length===1?'':'s'} exportado${valid.length===1?'':'s'} en PDF`);}catch(error){this.toast(error.message||'No se pudieron crear los reportes');}}
    exportSelectedHistoryPdf(){this.exportHistoryEntriesPdf(this.getSelectedHistoryEntries());}
    exportSelectedHistoryCsv(){const entries=this.getSelectedHistoryEntries();if(!entries.length)return this.toast('Selecciona al menos una carga');const esc=v=>`"${String(v??'').replaceAll('"','""')}"`,rows=[['Nombre','Fecha','Favorito','Trailer ancho','Trailer largo','Pilas','Pallets','Pendientes','Eficiencia','Largo usado','Tiempo segundos','Estrategia'],...entries.map(e=>[e.name,new Date(e.updatedAt||e.createdAt).toLocaleString('es-MX'),e.favorite?'Sí':'No',e.trailer?.width,e.trailer?.length,e.stacks?.length||0,e.stats?.loaded||0,e.stats?.left||0,Number(e.stats?.score||0).toFixed(1),Number(e.stats?.usedLength||0).toFixed(1),Number(e.optimizationMs||0)/1000,e.strategy||'Manual'])],blob=new Blob(['\ufeff'+rows.map(r=>r.map(esc).join(',')).join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`loadmaster-historial-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200);this.toast('Historial exportado en CSV');}
    deleteSelectedHistory(){const entries=this.getSelectedHistoryEntries();if(!entries.length)return;if(!confirm(`¿Eliminar ${entries.length} registro${entries.length===1?'':'s'} seleccionado${entries.length===1?'':'s'}?`))return;for(const e of entries){if(this.visualHistory.saved.some(x=>x.id===e.id))this.visualHistory.removeSaved(e.id);else this.visualHistory.removeRecent(e.id);}this.selectedHistoryIds.clear();this.renderVisualHistory();this.toast('Registros seleccionados eliminados');}
    compareSelectedHistory(){const entries=this.getSelectedHistoryEntries();if(entries.length!==2)return this.toast('Selecciona exactamente dos cargas');const [a,b]=entries,metrics=[['Pallets cargados',Number(a.stats?.loaded)||0,Number(b.stats?.loaded)||0,'max'],['Pendientes',Number(a.stats?.left)||0,Number(b.stats?.left)||0,'min'],['Eficiencia',Number(a.stats?.score)||0,Number(b.stats?.score)||0,'max','%'],['Largo usado',Number(a.stats?.usedLength)||0,Number(b.stats?.usedLength)||0,'min','"'],['Tiempo',Number(a.optimizationMs||0)/1000,Number(b.optimizationMs||0)/1000,'min',' s']];const winner=(x,y,mode)=>Math.abs(x-y)<.05?'tie':mode==='min'?(x<y?'a':'b'):(x>y?'a':'b');let html=`<div class="compareNames"><div><strong>${a.name}</strong><small>${a.strategy||'Manual'}</small></div><div><strong>${b.name}</strong><small>${b.strategy||'Manual'}</small></div></div><div class="comparisonTable"><div class="comparisonRow head"><span>Métrica</span><span>Opción A</span><span>Opción B</span></div>`;for(const [name,av,bv,mode,suffix=''] of metrics){const win=winner(av,bv,mode),fmt=v=>(name==='Eficiencia'||name==='Largo usado'||name==='Tiempo'?v.toFixed(1):String(v))+suffix;html+=`<div class="comparisonRow"><span>${name}</span><strong class="${win==='a'?'metricWinner':''}">${fmt(av)}</strong><strong class="${win==='b'?'metricWinner':''}">${fmt(bv)}</strong></div>`;}const overallA=(Number(a.stats?.loaded)||0)*10000-(Number(a.stats?.left)||0)*1000+(Number(a.stats?.score)||0)*10-(Number(a.stats?.usedLength)||0),overallB=(Number(b.stats?.loaded)||0)*10000-(Number(b.stats?.left)||0)*1000+(Number(b.stats?.score)||0)*10-(Number(b.stats?.usedLength)||0);html+=`</div><div class="comparisonVerdict"><strong>${Math.abs(overallA-overallB)<1?'Resultado muy parejo':overallA>overallB?`Mejor resultado general: ${a.name}`:`Mejor resultado general: ${b.name}`}</strong><p>La prioridad es cargar más pallets, dejar menos pendientes, usar menos largo y lograr mayor eficiencia.</p></div>`;$('comparisonContent').innerHTML=html;$('comparisonPanel').hidden=false;$('comparisonPanel').scrollIntoView({behavior:'smooth',block:'nearest'});}


    compact(){
      if(!this.state.stacks.length)return this.toast("No hay pilas");
      const engine=new LoadEngine(this.state.trailer);const before=clone(this.state.stacks);const result=engine.compact(before);
      if(!result.ok)return this.toast(result.message||"No se pudo compactar con seguridad");
      const after=result.stacks;
      const moved=after.filter(s=>{const o=before.find(x=>x.id===s.id);return Math.abs(o.x-s.x)>EPS||Math.abs(o.y-s.y)>EPS;}).length;
      if(!moved)return this.toast("La carga ya está compactada");
      this.store.remember();this.state.stacks=after;this.render();this.toast(`Compactación: ${moved} pila${moved===1?"":"s"} ajustada${moved===1?"":"s"}`);
    }
    solutionQuality(sol){
      if(!sol)return -Infinity;
      const loadedPallets=Number(sol.loadedPallets??(sol.stacks||[]).reduce((n,x)=>n+(Number(x.qty)||1),0));
      const loadedStacks=Number(sol.loadedStacks??(sol.stacks||[]).length);
      const left=Number(sol.unplacedPallets??(sol.unplaced||[]).reduce((n,x)=>n+(Number(x.qty)||1),0));
      const used=Number(sol.used??Geometry.usedLength(sol.stacks||[]));
      const efficiency=Number(sol.efficiency)||0;
      return loadedPallets*1e7+loadedStacks*1e5-left*1e4+efficiency*100-used;
    }
    currentSolutionSnapshot(){
      const stacks=clone(this.state.stacks||[]),unplaced=clone(this.state.pending||[]),loadedPallets=stacks.reduce((n,x)=>n+(Number(x.qty)||1),0),unplacedPallets=unplaced.reduce((n,x)=>n+(Number(x.qty)||1),0);
      return {stacks,unplaced,loadedStacks:stacks.length,loadedPallets,unplacedStacks:unplaced.length,unplacedPallets,used:Geometry.usedLength(stacks),efficiency:calculateLoadStatistics(stacks,this.state.trailer).efficiency,family:this.lastWinningStrategy||"Resultado actual"};
    }
    updateProgressiveStatus(text,active=true){
      const box=$("progressiveStatus"),label=$("progressiveStatusText");if(!box||!label)return;box.hidden=false;label.textContent=text;box.classList.toggle("active",active);$("stopProgressiveBtn").hidden=!active;
    }
    hideProgressiveOffer(){this.pendingProgressiveImprovement=null;const el=$("progressiveOffer");if(el)el.hidden=true;}
    stopProgressiveOptimization(silent=false){
      if(this.progressiveSession)this.progressiveSession.cancelled=true;
      this.progressiveSession=null;this.updateProgressiveStatus("Búsqueda progresiva detenida.",false);$("stopProgressiveBtn").hidden=true;
      if(!silent)this.toast("Búsqueda de mejoras detenida");
    }
    showProgressiveOffer(sol,previous){
      this.pendingProgressiveImprovement={solution:clone(sol),previous:clone(previous)};
      const extra=Math.max(0,(sol.loadedPallets||0)-(previous.loadedPallets||0)),eff=(Number(sol.efficiency)||0)-(Number(previous.efficiency)||0),saved=Math.max(0,(Number(previous.used)||0)-(Number(sol.used)||0));
      $("progressiveOfferText").textContent=`Encontré una solución mejor${extra?`: +${extra} pallet${extra===1?'':'s'}`:''}${eff>.05?` · +${eff.toFixed(1)}% eficiencia`:''}${saved>.05?` · ${saved.toFixed(1)}\" menos de largo`:''}.`;
      $("progressiveOffer").hidden=false;
    }
    applyProgressiveImprovement(){
      const item=this.pendingProgressiveImprovement;if(!item)return;
      const sol=item.solution,validation=validateLayout(sol.stacks,this.state.trailer);if(!validation.ok)return this.toast(`Mejora inválida: ${explainValidation(validation)}`);
      this.store.remember();this.state.stacks=clone(sol.stacks);this.state.pending=clone(sol.unplaced||[]);this.lastWinningStrategy=sol.family||"Optimización progresiva";this.lastOptimizationMs=this.progressiveSession?performance.now()-this.progressiveSession.started:this.lastOptimizationMs;this.render();this.renderSolutions(this.progressiveSession?.bestSolutions||[sol],Geometry.usedLength(item.previous.stacks||[]));this.recordRecentOptimization();this.hideProgressiveOffer();this.toast("Mejora progresiva aplicada");
    }
    ignoreProgressiveImprovement(){this.hideProgressiveOffer();this.toast("Se conservó el plano actual");}
    compareProgressiveImprovement(){
      const item=this.pendingProgressiveImprovement;if(!item)return;const a=item.previous,b=item.solution;
      $("optimizerSummary").textContent=`Comparación: actual ${a.loadedPallets} pallets, ${(a.efficiency||0).toFixed(1)}% y ${(a.used||0).toFixed(1)}\"; mejora ${b.loadedPallets} pallets, ${(b.efficiency||0).toFixed(1)}% y ${(b.used||0).toFixed(1)}\".`;
      $("optimizerPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
    }
    scheduleProgressiveRound(session){
      if(!session||session.cancelled||this.manualEditMode)return this.stopProgressiveOptimization(true);
      const elapsed=performance.now()-session.started,remaining=30000-elapsed;
      if(remaining<350){this.progressiveSession=null;this.updateProgressiveStatus(this.pendingProgressiveImprovement?"Búsqueda terminada: hay una mejora pendiente de aplicar.":"Búsqueda terminada: se conservó la mejor solución encontrada.",false);$("stopProgressiveBtn").hidden=true;this.strategyMemory.recordOutcome(session.original,this.state.trailer,session.best,"optimización adaptativa",session.baselineStats);this.recordRecentOptimization();return;}
      session.round++;
      this.updateProgressiveStatus(`IA buscando mejoras… ${(elapsed/1000).toFixed(0)} s · ronda ${session.round} · mejor actual: ${session.best.loadedStacks} pilas / ${session.best.loadedPallets} pallets`,true);
      setTimeout(()=>{
        if(session.cancelled||this.manualEditMode)return this.stopProgressiveOptimization(true);
        const budget=Math.min(3600,Math.max(900,remaining-120));
        const report=runPortfolioSearch(session.original,this.state.trailer,{totalTimeMs:budget,patterns:[],strategies:this.strategyMemory.items,baselineSolutions:session.bestSolutions||[]});
        if(report.ok&&report.solutions?.length){
          const candidate=report.solutions[0];session.bestSolutions=report.solutions;
          if(this.solutionQuality(candidate)>this.solutionQuality(session.best)+.1){
            const previous=session.best;session.best=clone(candidate);this.lastSolutions=report.solutions;
            this.showProgressiveOffer(candidate,previous);
            if(!(candidate.unplaced||[]).length){this.progressiveSession=null;this.updateProgressiveStatus("Solución completa encontrada. Puedes aplicarla o conservar el plano actual.",false);$("stopProgressiveBtn").hidden=true;this.strategyMemory.recordOutcome(session.original,this.state.trailer,candidate,"optimización adaptativa",session.baselineStats);if(!(candidate.unplaced||[]).length)this.patternMemory.learnComplete(candidate.stacks,this.state.trailer);return;}
          }
        }
        this.scheduleProgressiveRound(session);
      },80);
    }
    optimize(){
      if(this.progressiveSession)this.stopProgressiveOptimization(true);
      this.hideProgressiveOffer();
      const optimizationStarted=performance.now();this.currentOptimizationSessionId=uid();
      const allInput=[...this.state.stacks,...(this.state.pending||[])];
      if(!allInput.length)return this.toast("No hay pilas");
      $("optimizerPanel").hidden=false;$("optimizerSummary").textContent="Buscando una primera solución rápida…";$("optimizerResults").innerHTML="";this.updateProgressiveStatus("Preparando optimización progresiva…",true);
      const original=clone(allInput),beforeUsed=Geometry.usedLength(this.state.stacks),baselineStats={loaded:this.state.stacks.reduce((n,s)=>n+(Number(s.qty)||1),0),left:(this.state.pending||[]).reduce((n,s)=>n+(Number(s.qty)||1),0),used:beforeUsed};
      this.strategyMemory.prepare(original,this.state.trailer);
      setTimeout(()=>{
        const fast=new LoadEngine(this.state.trailer,{timeLimitMs:3200,patterns:this.patternMemory.patterns,strategies:this.strategyMemory.items});const report=fast.optimize(original);
        if(!report.ok||!report.solutions?.length){this.updateProgressiveStatus("No se encontró una solución válida.",false);$("optimizerSummary").textContent=report.message||"No se encontró una solución válida";this.toast(report.message||"No se pudo optimizar");return;}
        const best=report.solutions[0],validation=validateLayout(best.stacks,this.state.trailer);if(!validation.ok){this.updateProgressiveStatus("La solución rápida no pasó la validación.",false);return this.toast("La solución rápida no fue válida");}
        this.lastOptimizationMs=performance.now()-optimizationStarted;this.lastWinningStrategy=best.family||"Solución rápida";this.lastSolutions=report.solutions;this.lastUnplaced=clone(best.unplaced||[]);this.store.remember();this.state.stacks=clone(best.stacks);this.state.pending=clone(best.unplaced||[]);this.render();this.renderSolutions(report.solutions,beforeUsed);
        const leftText=best.unplacedStacks?` · ${best.unplacedStacks} pila${best.unplacedStacks===1?'':'s'} pendientes (${best.unplacedPallets} pallets)`:' · Toda la carga quedó dentro';
        $("optimizerSummary").textContent=`Primera solución: ${best.loadedStacks} pilas / ${best.loadedPallets} pallets · ${(best.efficiency||0).toFixed(1)}% eficiencia${leftText}`;
        if(!best.unplacedStacks){this.updateProgressiveStatus("Solución completa encontrada en la fase rápida.",false);$("stopProgressiveBtn").hidden=true;this.strategyMemory.recordOutcome(original,this.state.trailer,best,"optimización adaptativa",baselineStats);this.patternMemory.learnComplete(best.stacks,this.state.trailer);this.recordRecentOptimization();this.toast("Toda la carga quedó acomodada");return;}
        const session={id:uid(),started:optimizationStarted,original,baselineStats,best:clone(best),bestSolutions:report.solutions,round:0,cancelled:false};this.progressiveSession=session;
        this.updateProgressiveStatus(`Primera solución disponible · IA seguirá buscando hasta 30 s. Mejor actual: ${best.loadedStacks} pilas / ${best.loadedPallets} pallets`,true);
        this.toast("Primera solución lista; la IA continúa buscando mejoras");
        this.scheduleProgressiveRound(session);
      },40);
    }
    renderSolutions(solutions,beforeUsed){
      const root=$("optimizerResults");root.innerHTML="";
      solutions.forEach((sol,i)=>{
        const card=document.createElement("article");card.className="optimizerResult";
        const left=sol.unplacedStacks?` · <b>${sol.unplacedStacks} fuera</b> (${sol.unplacedPallets} pallets): ${sol.unplaced.slice(0,3).map(s=>s.name).join(", ")}${sol.unplaced.length>3?"…":""}`:" · <b>Carga completa</b>";
        const medal=i===0?"🥇":i===1?"🥈":"🥉";
        const label=sol.family?`${medal} ${i===0?"Mejor solución":`Alternativa ${i+1}`} · ${sol.family}`:`${medal} ${i===0?"Mejor solución":`Alternativa ${i+1}`}`;
        const rank=Number(sol.rankScore)||0,reasons=(sol.rankReasons||[]).join(" · ");
        card.innerHTML=`<div><strong>${label}</strong><p><b>${rank.toFixed(1)} puntos · ${sol.rankLabel||"Evaluada"}</b>${reasons?` · ${reasons}`:""}</p><p>${sol.loadedStacks} pilas / ${sol.loadedPallets} pallets dentro · ${sol.used.toFixed(1)}" usados · ${sol.efficiency.toFixed(1)}% eficiencia · ${sol.rotated||0} giradas${left}</p></div><button type="button">Aplicar</button>`;
        card.querySelector("button").onclick=()=>{const validation=validateLayout(sol.stacks,this.state.trailer);if(!validation.ok)return this.toast(`Solución inválida: ${explainValidation(validation)}`);this.store.remember();this.state.stacks=clone(sol.stacks);this.state.pending=clone(sol.unplaced||[]);this.lastWinningStrategy=sol.family||label;this.render();this.toast("Solución validada y aplicada");};root.appendChild(card);
      });
    }
    demo(){
      this.store.remember();this.state.trailer={width:96,length:628};this.state.stacks=[];
      const add=(name,w,l,x,y,qty=20,type="4-way")=>this.state.stacks.push({id:uid(),name,w,l,x,y,qty,maxHeight:Math.max(qty,20),type,category:"New",canRotate:type==="4-way",locked:false,rotated:false});
      add("48×40",48,40,0,0);add("48×40",48,40,48,0);add("42×42",42,42,0,42);add("42×42",42,42,54,42);add("Pila desviada",42,42,49,90);
      this.syncTrailerInputs();this.render();
    }
    saveFile(){const blob=new Blob([JSON.stringify({version:"5.38",...this.state},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="loadmaster-carga-v5.38.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
    saveImage(){
      if(!this.state.stacks.length)return this.toast("No hay una carga para guardar como imagen");
      const validation=validateLayout(this.state.stacks,this.state.trailer);
      if(!validation.ok)return this.toast(`Corrige la carga antes de guardar la imagen: ${explainValidation(validation)}`);
      try{
        const canvas=createPlanCanvas(this.state.stacks,this.state.trailer,{title:"LoadMaster AI · Plano de carga"});
        canvas.toBlob(blob=>{if(!blob)return this.toast("No se pudo crear la imagen");const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`loadmaster-plano-${new Date().toISOString().slice(0,10)}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);this.toast("Imagen PNG guardada");},"image/png");
      }catch{this.toast("No se pudo guardar la imagen");}
    }
    createProfessionalReportCanvas(){
      if(!this.state.stacks.length)throw new Error("No hay carga");
      const validation=validateLayout(this.state.stacks,this.state.trailer);if(!validation.ok)throw new Error(`Carga inválida: ${explainValidation(validation)}`);
      const info=calculateEfficiencyIndicator(this.state.stacks,this.state.pending,this.state.trailer),canvas=document.createElement("canvas");canvas.width=1240;canvas.height=1754;
      const ctx=canvas.getContext("2d");ctx.fillStyle="#f3f4f6";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#111827";ctx.fillRect(0,0,canvas.width,170);
      ctx.fillStyle="#fff";ctx.font="700 48px system-ui, sans-serif";ctx.fillText("LOADMASTER AI",70,76);ctx.font="24px system-ui, sans-serif";ctx.fillText("Reporte profesional de carga",70,121);ctx.textAlign="right";ctx.font="20px system-ui, sans-serif";ctx.fillText(new Date().toLocaleString("es-MX"),1170,95);ctx.textAlign="left";
      ctx.fillStyle="#fff";ctx.strokeStyle="#d1d5db";ctx.lineWidth=2;ctx.fillRect(55,205,1130,300);ctx.strokeRect(55,205,1130,300);
      ctx.fillStyle="#111827";ctx.font="700 32px system-ui, sans-serif";ctx.fillText(`Eficiencia ${info.score.toFixed(1)}% · ${info.label}`,85,260);
      ctx.font="22px system-ui, sans-serif";const rows=[
        [`Tráiler`,`${this.state.trailer.length}" largo × ${this.state.trailer.width}" ancho`],[`Carga`,`${this.state.stacks.length} pilas · ${info.loaded} pallets`],[`Ocupación del piso`,`${info.utilization.toFixed(1)}%`],[`Eficiencia en largo usado`,`${info.efficiency.toFixed(1)}%`],
        [`Área usada`,`${Math.round(info.usedArea).toLocaleString("es-MX")} in²`],[`Área libre`,`${Math.round(info.totalFreeArea).toLocaleString("es-MX")} in²`],[`Largo restante`,`${info.remainingLength.toFixed(1)}"`],[`Estrategia`,this.lastWinningStrategy||"Manual"]
      ];
      rows.forEach((row,i)=>{const col=i%2,x=85+col*555,y=310+Math.floor(i/2)*48;ctx.fillStyle="#6b7280";ctx.fillText(`${row[0]}:`,x,y);ctx.fillStyle="#111827";ctx.fillText(String(row[1]),x+205,y);});
      if(info.reasons.length){ctx.fillStyle="#92400e";ctx.font="19px system-ui, sans-serif";ctx.fillText(`Observación: ${info.reasons.join(" · ")}`,85,480);}
      const plan=createPlanCanvas(this.state.stacks,this.state.trailer,{title:"Plano de carga"}),maxW=1080,maxH=1120,scale=Math.min(maxW/plan.width,maxH/plan.height),w=plan.width*scale,h=plan.height*scale,x=(canvas.width-w)/2,y=555+(maxH-h)/2;
      ctx.fillStyle="#fff";ctx.fillRect(55,535,1130,1160);ctx.strokeStyle="#d1d5db";ctx.strokeRect(55,535,1130,1160);ctx.drawImage(plan,x,y,w,h);
      ctx.fillStyle="#6b7280";ctx.font="17px system-ui, sans-serif";ctx.textAlign="center";ctx.fillText("Generado por LoadMaster AI · Verifique el plano antes de ejecutar la carga.",620,1730);ctx.textAlign="left";return canvas;
    }
    makeProfessionalPdf(){return canvasToPdfBlob(this.createProfessionalReportCanvas());}
    saveProfessionalPdf(){
      try{const blob=this.makeProfessionalPdf(),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`loadmaster-reporte-${new Date().toISOString().slice(0,10)}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1800);this.toast("Reporte profesional PDF guardado");}catch(error){this.toast(error.message||"No se pudo crear el PDF");}
    }
    async shareProfessionalReport(){
      try{
        const blob=this.makeProfessionalPdf(),fileName=`loadmaster-reporte-${new Date().toISOString().slice(0,10)}.pdf`;
        const file=typeof File!=="undefined"?new File([blob],fileName,{type:"application/pdf"}):null;
        const text=`Plano de carga LoadMaster AI · ${this.state.stacks.length} pilas · ${calculateEfficiencyIndicator(this.state.stacks,this.state.pending,this.state.trailer).score.toFixed(1)}% de eficiencia.`;
        if(file&&navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:"Reporte LoadMaster AI",text,files:[file]});return this.toast("Reporte compartido");}
        const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1800);
        window.open(`https://wa.me/?text=${encodeURIComponent(text+" El PDF quedó guardado para adjuntarlo.")}`,"_blank","noopener");this.toast("PDF guardado; adjúntalo en WhatsApp");
      }catch(error){if(error?.name!=="AbortError")this.toast(error.message||"No se pudo compartir el reporte");}
    }
    async openFile(e){const file=e.target.files[0];if(!file)return;try{const d=JSON.parse(await file.text());this.store.remember();this.state.trailer=d.trailer||this.state.trailer;this.state.stacks=d.stacks||[];this.state.pending=d.pending||[];this.state.library=(d.library||this.state.library).map(normalizeLibraryItem);this.state.selectedId=null;this.store.persistLibrary();this.syncTrailerInputs();this.render();this.toast("Carga abierta");}catch{this.toast("Archivo no válido");}e.target.value="";}
    setManualEditMode(enabled){
      if(enabled&&this.progressiveSession)this.stopProgressiveOptimization(true);
      this.manualEditMode=Boolean(enabled);
      if(!this.manualEditMode)this.state.selectedId=null;
      document.body.classList.toggle("manual-edit-mode",this.manualEditMode);
      $("compactPlanWrap").hidden=this.manualEditMode;
      $("manualCanvasWrap").hidden=!this.manualEditMode;
      $("manualModeBtn").hidden=this.manualEditMode;
      $("finishManualBtn").hidden=!this.manualEditMode;
      $("planModeTitle").textContent=this.manualEditMode?"Edición manual":"Plano compacto";
      $("planModeHelp").textContent=this.manualEditMode?"Vista vertical editable: mueve, gira o elimina pilas.":"Vista horizontal para revisar el resultado de la automatización. Las medidas reales no cambian.";
      if(!this.manualEditMode)$("floatingTools").hidden=true;
      this.render();
      if(this.manualEditMode)setTimeout(()=>$("manualCanvasWrap").scrollIntoView({behavior:"smooth",block:"start"}),40);
    }
    renderCompactPlan(){
      const canvas=$("compactPlanCanvas"),wrap=$("compactPlanWrap");if(!canvas||!wrap)return;
      const trailer=this.state.trailer,stacks=this.state.stacks||[];
      const maxCss=Math.max(280,Math.min(1000,(wrap.clientWidth||window.innerWidth)-24));
      const padding=22,labelBand=32;
      const scale=Math.max(.35,Math.min(1.3,(maxCss-padding*2)/Math.max(1,trailer.length)));
      const cssW=Math.max(280,Math.round(trailer.length*scale+padding*2));
      const cssH=Math.max(118,Math.round(trailer.width*scale+padding*2+labelBand));
      const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(cssW*dpr);canvas.height=Math.round(cssH*dpr);canvas.style.width=`${cssW}px`;canvas.style.height=`${cssH}px`;
      const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cssW,cssH);
      ctx.fillStyle="#dde3ea";ctx.fillRect(0,0,cssW,cssH);
      const ox=padding,oy=padding+labelBand;ctx.fillStyle="#fff";ctx.strokeStyle="#111827";ctx.lineWidth=3;ctx.fillRect(ox,oy,trailer.length*scale,trailer.width*scale);ctx.strokeRect(ox,oy,trailer.length*scale,trailer.width*scale);
      ctx.strokeStyle="rgba(15,23,42,.08)";ctx.lineWidth=1;for(let x=0;x<trailer.length;x+=24){ctx.beginPath();ctx.moveTo(ox+x*scale,oy);ctx.lineTo(ox+x*scale,oy+trailer.width*scale);ctx.stroke();}
      for(let y=0;y<trailer.width;y+=24){ctx.beginPath();ctx.moveTo(ox,oy+y*scale);ctx.lineTo(ox+trailer.length*scale,oy+y*scale);ctx.stroke();}
      for(const s of stacks){const valid=this.valid(s);ctx.fillStyle=s.locked?"rgba(124,58,237,.24)":valid?"rgba(37,99,235,.22)":"rgba(220,38,38,.25)";ctx.strokeStyle=s.locked?"#7c3aed":valid?"#16a34a":"#dc2626";ctx.lineWidth=Math.max(1,Math.min(2,scale*1.5));const x=ox+s.y*scale,y=oy+s.x*scale,w=s.l*scale,h=s.w*scale;ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);if(w>24&&h>15){ctx.fillStyle="#111827";ctx.font=`700 ${Math.max(7,Math.min(11,h*.32))}px system-ui`;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(`${String(s.name||"Pila").slice(0,10)}${Array.isArray(s.layers)&&s.layers.length>1?` ↥${s.layers.length}`:""}`,x+w/2,y+h/2);}}
      ctx.fillStyle="#111827";ctx.font="700 11px system-ui";ctx.textAlign="left";ctx.textBaseline="alphabetic";ctx.fillText("NARIZ",ox,18);ctx.textAlign="right";ctx.fillText("PUERTAS",ox+trailer.length*scale,18);ctx.textAlign="center";ctx.fillStyle="#475569";ctx.font="600 10px system-ui";ctx.fillText(`${trailer.length}" largo × ${trailer.width}" ancho · ${stacks.length} pilas`,cssW/2,cssH-5);
    }
    renderLibrary(){
      const sel=$("librarySelect"),manager=$("catalogManageSelect"),current=sel.value,managerCurrent=manager?.value||"",q=($("catalogSearch")?.value||"").trim().toLowerCase();
      const items=[...this.state.library].sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name)).filter(item=>!q||`${item.name} ${item.l}x${item.w} ${item.type} ${item.category} ${item.notes||""}`.toLowerCase().includes(q));
      sel.innerHTML='<option value="">— Nueva medida —</option>';
      if(manager)manager.innerHTML='<option value="">— Selecciona una medida —</option>';
      items.forEach(item=>{
        const text=`${item.favorite?"★ ":""}${item.name} · ${item.l}×${item.w} · ${item.type} · máx ${item.maxHeight}`;
        const o=document.createElement("option");o.value=item.id;o.textContent=text;sel.appendChild(o);
        if(manager){const m=document.createElement("option");m.value=item.id;m.textContent=text;manager.appendChild(m);}
      });
      if([...sel.options].some(o=>o.value===current))sel.value=current;
      if(manager&&[...manager.options].some(o=>o.value===managerCurrent))manager.value=managerCurrent;
      const status=$("catalogSearchStatus");if(status)status.textContent=q?`${items.length} medida${items.length===1?"":"s"} coincide${items.length===1?"":"n"}. Selecciónala para editar, duplicar o eliminar.`:`${this.state.library.length} medida${this.state.library.length===1?"":"s"} guardada${this.state.library.length===1?"":"s"}.`;
      this.updateCatalogSummary();
    }

    render(){
      const trailer=$("trailer");trailer.style.width=`${this.state.trailer.width*SCALE}px`;trailer.style.height=`${this.state.trailer.length*SCALE}px`;trailer.querySelectorAll(".stack").forEach(n=>n.remove());
      this.state.stacks.forEach(s=>{const el=document.createElement("div");el.className="stack"+(s.id===this.state.selectedId?" selected":"")+(s.locked?" locked":"")+(this.valid(s)?"":" invalid");el.dataset.id=s.id;el.style.left=`${s.x*SCALE}px`;el.style.top=`${s.y*SCALE}px`;el.style.width=`${s.w*SCALE}px`;el.style.height=`${s.l*SCALE}px`;el.innerHTML=`${s.name}${Array.isArray(s.layers)&&s.layers.length>1?` <span class="mixedStackBadge">${s.layers.length} niveles</span>`:""}<small>${s.qty} alto · ${s.type}${s.stackLimit?` · límite ${s.stackLimit}`:""}</small>`;trailer.appendChild(el);if(this.manualEditMode)this.wireDrag(el,s);});
      $("compactPlanWrap").hidden=this.manualEditMode;$("manualCanvasWrap").hidden=!this.manualEditMode;$("manualModeBtn").hidden=this.manualEditMode;$("finishManualBtn").hidden=!this.manualEditMode;this.renderCompactPlan();
      this.renderLibrary();this.renderCatalog();this.renderSelection();this.renderMetrics();this.renderLoadStatistics();this.renderPatterns();this.renderPending();this.renderVisualHistory();
    }
    renderSelection(){const s=this.selected(),mixed=s&&Array.isArray(s.layers)&&s.layers.length>1;$("selectedInfo").textContent=s?`${s.name} · ${s.qty} alto · ${s.type} · ${s.category}${mixed?` · ${s.layers.length} niveles · límite ${s.stackLimit||s.maxHeight}`:""}${s.locked?" · bloqueada":""}`:"Ninguna seleccionada";$("floatingTools").hidden=!s||!this.manualEditMode;if(s){$("bottomSelectedName").textContent=`${s.name} · ${s.qty} alto · ${s.type}${mixed?` · ${s.layers.length} niveles`:""}`;$("floatLockBtn").textContent=s.locked?"🔓 Desbloq.":"🔒 Bloq.";const can=!mixed&&s.type==="4-way"&&s.canRotate&&s.w!==s.l;$("floatRotateBtn").disabled=!can;}}
    renderMetrics(){const used=Geometry.usedLength(this.state.stacks),free=Math.max(0,this.state.trailer.length-used),area=Geometry.floorArea(this.state.stacks),total=this.state.trailer.width*this.state.trailer.length,env=Math.max(1,this.state.trailer.width*used);$("metricStacks").textContent=this.state.stacks.length;$("metricPallets").textContent=this.state.stacks.reduce((a,s)=>a+s.qty,0);$("metricUsed").textContent=`${used.toFixed(1)}\"`;$("metricFree").textContent=`${free.toFixed(1)}\"`;$("metricUtilization").textContent=`${Math.min(100,area/Math.max(1,total)*100).toFixed(1)}%`;$("metricEfficiency").textContent=`${Math.min(100,area/env*100).toFixed(1)}%`;const bad=this.state.stacks.some(s=>!this.valid(s));$("metricStatus").textContent=bad?"Hay conflicto":"Carga válida";$("metricStatus").style.color=bad?"#dc2626":"#16a34a";$("freeZone").style.top=`${used*SCALE}px`;$("freeZone").style.height=`${free*SCALE}px`;}
    renderLoadStatistics(){
      const stats=calculateLoadStatistics(this.state.stacks,this.state.trailer);
      const formatArea=value=>`${Math.round(value).toLocaleString("es-MX")} in² (${(value/144).toFixed(1)} ft²)`;
      $("statsUsedArea").textContent=formatArea(stats.usedArea);
      $("statsFreeArea").textContent=formatArea(stats.totalFreeArea);
      $("statsDeadArea").textContent=formatArea(stats.deadArea);
      $("statsGapCount").textContent=String(stats.gapCount);
      $("statsMaxHeight").textContent=`${stats.maxHeight} pallet${stats.maxHeight===1?"":"s"}`;
      $("statsRemainingLength").textContent=`${stats.remainingLength.toFixed(1)}"`;
      $("statsOptimizeTime").textContent=this.lastOptimizationMs?`${(this.lastOptimizationMs/1000).toFixed(2)} s`:"—";
      $("statsWinningStrategy").textContent=this.lastWinningStrategy||"Manual / sin optimizar";
      const grade=$("statsGrade");grade.textContent=`${stats.utilization.toFixed(1)}%`;grade.classList.toggle("warn",stats.utilization<70&&stats.utilization>=40);grade.classList.toggle("bad",stats.utilization<40);
      grade.title=`Uso total del piso: ${stats.utilization.toFixed(1)}% · eficiencia en el largo usado: ${stats.efficiency.toFixed(1)}%`;
      const indicator=calculateEfficiencyIndicator(this.state.stacks,this.state.pending,this.state.trailer),ring=$("efficiencyRing");
      ring.style.setProperty("--score",indicator.score.toFixed(1));ring.className=`efficiencyRing ${indicator.tone}`;$("efficiencyScore").textContent=`${indicator.score.toFixed(1)}%`;$("efficiencyLabel").textContent=indicator.label;
      $("efficiencyExplanation").textContent=indicator.reasons.length?`Puede mejorar por: ${indicator.reasons.join("; ")}.`:(indicator.score>=99.9?"Carga completa, compacta y sin huecos relevantes.":"Carga válida con oportunidad mínima de compactación.");
    }
    wireDrag(el,s){let active=false,startX=0,startY=0,origin=null,before=null,moved=false;el.onpointerdown=e=>{e.preventDefault();e.stopPropagation();this.state.selectedId=s.id;this.renderSelection();if(s.locked)return this.toast("Esta pila está bloqueada");active=true;startX=e.clientX;startY=e.clientY;origin={x:s.x,y:s.y};before=this.store.snapshot();moved=false;el.setPointerCapture?.(e.pointerId);};el.onpointermove=e=>{if(!active)return;const dx=(e.clientX-startX)/SCALE,dy=(e.clientY-startY)/SCALE;if(Math.abs(dx)>0.5||Math.abs(dy)>0.5)moved=true;s.x=roundQuarter(origin.x+dx);s.y=roundQuarter(origin.y+dy);el.style.left=`${s.x*SCALE}px`;el.style.top=`${s.y*SCALE}px`;el.classList.toggle("invalid",!this.valid(s));this.renderMetrics();};const finish=()=>{if(!active)return;active=false;if(moved){this.store.history.push(before);this.store.future=[];const others=this.state.stacks.filter(o=>o.id!==s.id);const axes=Geometry.candidateAxes(s,others,this.state.trailer);const nx=[...axes.xs].sort((a,b)=>Math.abs(a-s.x)-Math.abs(b-s.x))[0],ny=[...axes.ys].sort((a,b)=>Math.abs(a-s.y)-Math.abs(b-s.y))[0];const test={...s,x:nx,y:ny};if(Math.abs(nx-s.x)<=4&&Geometry.valid(test,others,this.state.trailer))s.x=nx;const test2={...s,y:ny};if(Math.abs(ny-s.y)<=4&&Geometry.valid(test2,others,this.state.trailer))s.y=ny;this.render();if(validateLayout(this.state.stacks,this.state.trailer).ok){try{const previous=JSON.parse(before);this.strategyMemory.learnManual(previous.stacks||[],this.state.stacks,this.state.trailer);}catch{}}}};el.onpointerup=finish;el.onpointercancel=finish;}
  }




// v5.38: Buscar apilamiento funciona antes y después de la optimización
(function initThemeController(){
  const STORAGE_KEY="loadmaster-theme";
  const root=document.documentElement;
  const meta=document.querySelector('meta[name="theme-color"]');
  const media=window.matchMedia?.('(prefers-color-scheme: dark)');
  const normalize=value=>["light","dark","system"].includes(value)?value:"system";
  const effective=value=>value==="system"?(media?.matches?"dark":"light"):value;
  const apply=value=>{
    const preference=normalize(value);
    const resolved=effective(preference);
    root.dataset.theme=resolved;
    root.dataset.themePreference=preference;
    if(meta)meta.setAttribute("content",resolved==="dark"?"#020617":"#111827");
    const select=document.getElementById("themeSelect");
    if(select&&select.value!==preference)select.value=preference;
  };
  let saved="system";
  try{saved=normalize(localStorage.getItem(STORAGE_KEY)||"system");}catch{}
  apply(saved);
  const wire=()=>{
    const select=document.getElementById("themeSelect");
    if(!select)return;
    select.value=saved;
    select.addEventListener("change",()=>{
      saved=normalize(select.value);
      try{localStorage.setItem(STORAGE_KEY,saved);}catch{}
      apply(saved);
    });
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire,{once:true});else wire();
  media?.addEventListener?.("change",()=>{if(saved==="system")apply(saved);});
})();

new App();
