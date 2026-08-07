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
  const completion=pendingStacks===0?60:Math.max(0,35-pendingPallets*6-pendingStacks*8);
  const utilization=efficiency*0.18;
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
    if(!missing.length||missing.length>5)return [];
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
    if(!missing.length||missing.length>5)return [];
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

  focusedPendingRescue(placed,unplaced,originals){
    // v5.56: rescate orientado por la medida pendiente con más pallets. Esta
    // búsqueda no intenta mejorar todo el plano a la vez: libera vecindarios que
    // se parecen a la huella objetivo y obliga a insertar ese objetivo primero.
    const missing=(unplaced||[]).map(Geometry.clone);
    if(!missing.length||missing.length>5)return [];
    const area=s=>(Number(s.w)||0)*(Number(s.l)||0),key=s=>`${Math.min(Number(s.w)||0,Number(s.l)||0)}x${Math.max(Number(s.w)||0,Number(s.l)||0)}`;
    const focus=[...missing].sort((a,b)=>(Number(b.qty)||1)-(Number(a.qty)||1)||area(b)-area(a))[0];
    const fkey=key(focus),focusMissing=missing.filter(x=>key(x)===fkey),otherMissing=missing.filter(x=>key(x)!==fkey);
    const movable=placed.filter(s=>!s.locked);if(!movable.length)return [];
    const fitScore=s=>{
      const fw=Number(focus.w)||0,fl=Number(focus.l)||0,sw=Number(s.w)||0,sl=Number(s.l)||0;
      const support=(sw+EPS>=fw&&sl+EPS>=fl)||(sw+EPS>=fl&&sl+EPS>=fw);
      return (support?0:1e6)+Math.min(Math.abs(sw-fw)+Math.abs(sl-fl),Math.abs(sw-fl)+Math.abs(sl-fw))*100+Math.abs(area(s)-area(focus));
    };
    const ordered=[...movable].sort((a,b)=>fitScore(a)-fitScore(b)||(Number(a.qty)||1)-(Number(b.qty)||1));
    const candidates=[];
    for(const count of [6,9,12,16]){
      if(!this.hasTime())break;
      const selected=ordered.slice(0,Math.min(count,ordered.length)),ids=new Set(selected.map(x=>x.id)),base=placed.filter(x=>!ids.has(x.id));
      if(!validateLayout(base,this.trailer).ok)continue;
      const pool=[...focusMissing,...selected,...otherMissing];
      const orders=[pool,[...focusMissing,...selected.sort((a,b)=>area(b)-area(a)),...otherMissing],...this.rowCombinationOrders(pool),...this.orders(pool).slice(0,8)];
      for(const order of orders){
        if(!this.hasTime())break;
        const result=this.packPartialLookahead(order,base,originals,pool.length>24?650:900)||this.packPartial(order,base,originals,pool.length>24?650:900);
        if(!result||!validateLayout(result.stacks,this.trailer).ok)continue;
        const placedIds=new Set(result.stacks.map(s=>s.id)),stillMissing=originals.filter(s=>!placedIds.has(s.id));
        candidates.push({name:`Rescate enfocado ${fkey}`,family:'Focused Pending Rescue',stacks:result.stacks,unplaced:stillMissing});
        if(!stillMissing.length)return candidates;
      }
    }
    return candidates;
  }

  ruinRecreateRescue(placed,unplaced,originals){
    // v5.56: Large Neighborhood Search. Sacrifica partes de una solución parcial
    // en lugar de protegerlas y reconstruye 15–60 % de las pilas junto con las
    // pendientes. Está especialmente pensado para las últimas 1–5 pilas.
    const missing=(unplaced||[]).map(Geometry.clone);
    if(!missing.length||missing.length>5)return [];
    const movable=placed.filter(s=>!s.locked);
    if(movable.length<3)return [];
    const candidates=[],seen=new Set();
    const fractions=[0.15,0.22,0.30,0.38,0.48,0.60];
    const area=s=>(Number(s.w)||0)*(Number(s.l)||0);
    const sameShape=s=>missing.some(p=>(Math.abs(s.w-p.w)<EPS&&Math.abs(s.l-p.l)<EPS)||(Math.abs(s.w-p.l)<EPS&&Math.abs(s.l-p.w)<EPS));
    const similarity=s=>Math.min(...missing.map(p=>Math.abs(area(s)-area(p))+Math.abs(Math.max(s.w,s.l)-Math.max(p.w,p.l))*12));
    const families=[
      [...movable].sort((a,b)=>(Number(a.qty)||1)-(Number(b.qty)||1)||similarity(a)-similarity(b)),
      [...movable].sort((a,b)=>(sameShape(b)?1:0)-(sameShape(a)?1:0)||similarity(a)-similarity(b)),
      [...movable].sort((a,b)=>(b.y+b.l)-(a.y+a.l)),
      [...movable].sort((a,b)=>(a.y+a.l)-(b.y+b.l)),
      [...movable].sort((a,b)=>area(a)-area(b))
    ];
    for(const f of fractions){
      if(!this.hasTime())break;
      const n=Math.max(3,Math.min(movable.length,Math.ceil(movable.length*f)));
      for(const family of families){
        if(!this.hasTime())break;
        const removedList=family.slice(0,n),ids=[...new Set(removedList.map(s=>s.id))],key=ids.slice().sort().join('|');
        if(seen.has(key))continue;seen.add(key);
        const removed=new Set(ids),base=placed.filter(s=>s.locked||!removed.has(s.id));
        if(!validateLayout(base,this.trailer).ok)continue;
        const pieces=placed.filter(s=>removed.has(s.id)),pool=[...missing,...pieces];
        const orders=[
          [...missing,...pieces],
          [...pool].sort((a,b)=>(Number(b.qty)||1)-(Number(a.qty)||1)||area(b)-area(a)),
          [...pool].sort((a,b)=>area(b)-area(a)),
          ...this.rowCombinationOrders(pool),
          ...this.orders(pool).slice(0,8)
        ];
        for(const order of orders){
          if(!this.hasTime())break;
          const beam=pool.length>28?420:pool.length>18?650:900;
          const result=this.packPartialLookahead(order,base,originals,beam)||this.packPartial(order,base,originals,beam);
          if(!result||!validateLayout(result.stacks,this.trailer).ok)continue;
          const placedIds=new Set(result.stacks.map(s=>s.id)),stillMissing=originals.filter(s=>!placedIds.has(s.id));
          candidates.push({name:`Sacrificio y reconstrucción (${ids.length} pilas)`,family:'Ruin & Recreate',stacks:result.stacks,unplaced:stillMissing});
          if(!stillMissing.length)return candidates;
        }
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

  futurePlacementScore(placed, remaining){
    // Look-ahead: premia planos que todavía conservan huecos utilizables para
    // piezas futuras. Evita que el beam conserve solo la opción más llena ahora
    // si esa opción bloquea todas las piezas pequeñas o cuadradas después.
    let score=0;
    for(const s of (remaining||[]).slice(0,10)){
      const options=this.placementOptions(s,placed,8);
      if(options.length) score+=Math.min(4,options.length)*3+(Number(s.qty)||1)*0.35;
      else score-=(Number(s.qty)||1)*2.5;
    }
    return score;
  }

  packPartialLookahead(order,locked,originals,beamWidth=220){
    let beams=[{placed:Geometry.clone(locked),unplaced:[]}];
    for(let index=0;index<order.length;index++){
      if(!this.hasTime())break;
      const original=order[index],remaining=order.slice(index+1);
      const next=[];
      for(const state of beams){
        if(!this.hasTime())break;
        const options=this.placementOptions(original,state.placed,32);
        for(const c of options)next.push({placed:[...state.placed,c],unplaced:[...state.unplaced]});
        next.push({placed:state.placed,unplaced:[...state.unplaced,Geometry.clone(original)]});
      }
      const ranked=next.map(state=>{
        const rank=this.partialRank(state,originals);
        const look=this.futurePlacementScore(state.placed,remaining);
        // La carga total sigue siendo prioridad, pero se conserva diversidad
        // geométrica cuando dos candidatos están cerca.
        const value=rank.loadedPallets*1e6+rank.loadedStacks*1e4+rank.loadedArea*2-rank.score+look*600;
        return {state,rank,value};
      }).sort((a,b)=>b.value-a.value);
      const unique=[],seen=new Set(),shapeQuota=new Map();
      for(const item of ranked){
        const used=Math.round(Geometry.usedLength(item.state.placed));
        const pending=item.state.unplaced.length;
        const bucket=`${used}:${pending}`;
        const n=shapeQuota.get(bucket)||0;if(n>=Math.max(6,Math.floor(beamWidth/12)))continue;
        const key=item.state.placed.map(s=>`${s.id}:${s.x},${s.y},${s.w},${s.l}`).sort().join('|');
        if(seen.has(key))continue;
        seen.add(key);shapeQuota.set(bucket,n+1);unique.push(item.state);
        if(unique.length>=beamWidth)break;
      }
      beams=unique;
    }
    if(!beams.length)return null;
    beams.sort((a,b)=>{
      const ar=this.partialRank(a,originals),br=this.partialRank(b,originals);
      return br.loadedPallets-ar.loadedPallets||br.loadedStacks-ar.loadedStacks||ar.score-br.score;
    });
    let best=beams[0];
    for(const state of beams.slice(0,8)){
      const rescued=this.compactPendingRescue(state.placed,state.unplaced,originals);
      if(rescued){
        const a=this.partialRank({placed:rescued.stacks},originals),b=this.partialRank(best,originals);
        if(a.loadedPallets>b.loadedPallets||(a.loadedPallets===b.loadedPallets&&a.score<b.score))best={placed:rescued.stacks,unplaced:rescued.unplaced||[]};
      }
    }
    const polished=this.sequenceRefine(best.placed,originals,4);
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
        const standard=this.packPartial(order,locked,input,Math.max(120,beamWidth*2));
        const lookahead=this.packPartialLookahead(order,locked,input,Math.max(180,beamWidth*3));
        const choices=[standard,lookahead].filter(x=>x&&validateLayout(x.stacks,this.trailer).ok);
        if(!choices.length)continue;
        choices.sort((a,b)=>{const ap=a.stacks.reduce((n,s)=>n+(Number(s.qty)||1),0),bp=b.stacks.reduce((n,s)=>n+(Number(s.qty)||1),0);return bp-ap||b.stacks.length-a.stacks.length||layoutScore(a.stacks,this.trailer,input)-layoutScore(b.stacks,this.trailer,input)});
        const partial=choices[0];
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
      if(this.hasTime()){
        const lookahead=this.packPartialLookahead(order,locked,input,Math.max(160,beamWidth*2));
        if(lookahead&&validateLayout(lookahead.stacks,this.trailer).ok)solutions.push({name:(lookahead.unplaced||[]).length?'Backtracking con reserva de huecos':'Backtracking · carga completa',family:'Backtracking',...lookahead});
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
        if(this.hasTime()){
          for(const rebuilt of this.focusedPendingRescue(best.s.stacks,best.missing,input))solutions.push(rebuilt);
          for(const rebuilt of this.ruinRecreateRescue(best.s.stacks,best.missing,input))solutions.push(rebuilt);
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
  const escapeSeeds=[...all].filter(s=>s&&Array.isArray(s.stacks)&&(s.unplaced||[]).length>0&&(s.unplaced||[]).length<=5)
    .sort((a,b)=>(b.loadedPallets||0)-(a.loadedPallets||0)||(b.loadedStacks||0)-(a.loadedStacks||0)).slice(0,3);
  for(let i=0;i<escapeSeeds.length;i++){
    const elapsed=Date.now()-started,remaining=totalTimeMs-elapsed;
    if(remaining<120)break;
    const seed=escapeSeeds[i];
    const engine=new LoadEngine(trailer,{timeLimitMs:remaining,patterns:[],strategies,seedOffset:211+i*97,profile:'restart'});
    const rescueCandidates=[
      ...engine.optimumEscapeRescue(Geometry.clone(seed.stacks),Geometry.clone(seed.unplaced||[]),Geometry.clone(input)),
      ...engine.focusedPendingRescue(Geometry.clone(seed.stacks),Geometry.clone(seed.unplaced||[]),Geometry.clone(input)),
      ...engine.ruinRecreateRescue(Geometry.clone(seed.stacks),Geometry.clone(seed.unplaced||[]),Geometry.clone(input))
    ];
    for(const sol of rescueCandidates){
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


// Fachada pública del optimizador. v5.56 expone una integración estable
// "Optimizer is not defined" y garantiza una búsqueda desde una copia limpia.
const Optimizer = Object.freeze({
  async optimizeDeep(input, trailer, options = {}) {
    const cleanInput = Geometry.clone(Array.isArray(input) ? input : []).map(s => ({
      ...s, x: 0, y: 0, locked: false, blocked: false
    }));
    if (!cleanInput.length) return { ok: false, solutions: [], message: 'No hay pilas para optimizar.' };

    const totalMs = Math.max(500, Number(options.totalMs) || 7000);
    const quickMs = Math.max(150, Math.min(totalMs, Number(options.quickMs) || 1200));
    const patterns = Array.isArray(options.patterns) ? options.patterns : [];
    const strategies = Array.isArray(options.strategies) ? options.strategies : [];
    const seed = Number(options.seed) || Date.now();

    const quickEngine = new LoadEngine(trailer, {
      timeLimitMs: quickMs, patterns, strategies,
      seedOffset: seed % 1000003, profile: 'restart'
    });
    const quickReport = quickEngine.optimize(Geometry.clone(cleanInput));
    const baselineSolutions = quickReport?.ok ? (quickReport.solutions || []) : [];
    if (baselineSolutions.some(s => !(s.unplaced || []).length)) {
      const ranked = rankSolutionsIntelligently(baselineSolutions, trailer);
      return { ok: true, solutions: selectDiverseSolutions(ranked, 3, trailer), attemptedProfiles: 1, elapsedMs: quickMs };
    }

    const portfolio = runPortfolioSearch(Geometry.clone(cleanInput), trailer, {
      totalTimeMs: Math.max(250, totalMs - quickMs),
      patterns, strategies, baselineSolutions
    });
    if (portfolio.ok) return portfolio;
    if (quickReport?.ok) return quickReport;
    return {
      ok: false, solutions: [],
      attemptedProfiles: portfolio.attemptedProfiles || 0,
      elapsedMs: portfolio.elapsedMs || totalMs,
      message: quickReport?.message || 'No se encontró una solución válida.'
    };
  }
});
