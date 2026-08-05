import { Geometry } from './geometry.js';
import { validateLayout, explainValidation } from './validator.js';
import { layoutScore } from './scoring.js';
import { refineLayout } from './refine.js';

export class LoadEngine {
  constructor(trailer){this.trailer=Geometry.clone(trailer);}
  orientations(s){
    const out=[{...s}];
    if(s.type==='4-way'&&s.canRotate&&s.w!==s.l)out.push({...s,w:s.l,l:s.w,rotated:!s.rotated});
    return out;
  }
  metrics(stacks,originals){return {score:layoutScore(stacks,this.trailer,originals),used:Geometry.usedLength(stacks),efficiency:Geometry.floorArea(stacks)/Math.max(1,this.trailer.width*Geometry.usedLength(stacks))*100,moved:stacks.filter(s=>{const o=originals.find(x=>x.id===s.id);return o&&(o.x!==s.x||o.y!==s.y||o.w!==s.w||o.l!==s.l)}).length};}
  compact(input){
    const locked=input.filter(s=>s.locked); const lockedCheck=validateLayout(locked,this.trailer);
    if(!lockedCheck.ok)return {ok:false,message:`Pilas bloqueadas inválidas: ${explainValidation(lockedCheck)}`};
    const refined=refineLayout(input,this.trailer);
    const check=validateLayout(refined,this.trailer);
    return check.ok?{ok:true,stacks:refined}:{ok:false,message:`Compactación rechazada: ${explainValidation(check)}`};
  }
  orders(movable){
    const variants=[
      [...movable].sort((a,b)=>b.w*b.l-a.w*a.l),
      [...movable].sort((a,b)=>b.l-a.l||b.w-a.w),
      [...movable].sort((a,b)=>b.w-a.w||b.l-a.l),
      [...movable].sort((a,b)=>a.y-b.y||a.x-b.x),
      [...movable].sort((a,b)=>(b.w+b.l)-(a.w+a.l))
    ];
    let seed=2166136261; for(const s of movable)for(const ch of String(s.id))seed=(seed^ch.charCodeAt(0))*16777619>>>0;
    const rnd=()=>((seed=1664525*seed+1013904223>>>0)/4294967296);
    for(let k=0;k<10;k++){const a=[...movable];for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}variants.push(a);}
    return variants;
  }
  pack(order,locked,originals,beamWidth=70){
    let beams=[Geometry.clone(locked)];
    for(const original of order){
      const next=[];
      for(const placed of beams)for(const shape of this.orientations(original)){
        for(const c of Geometry.candidates({...shape,x:0,y:0},placed,this.trailer).slice(0,220))next.push([...placed,c]);
      }
      if(!next.length)return null;
      next.sort((a,b)=>layoutScore(a,this.trailer,originals)-layoutScore(b,this.trailer,originals));
      const unique=[],seen=new Set();
      for(const layout of next){const key=layout.map(s=>`${s.id}:${s.x},${s.y},${s.w},${s.l}`).sort().join('|');if(!seen.has(key)){seen.add(key);unique.push(layout);}if(unique.length>=beamWidth)break;}
      beams=unique;
    }
    if(!beams.length)return null;
    const polished=refineLayout(beams[0],this.trailer);
    return validateLayout(polished,this.trailer).ok?polished:null;
  }
  optimize(input){
    const locked=input.filter(s=>s.locked), movable=input.filter(s=>!s.locked);
    const lockedCheck=validateLayout(locked,this.trailer);
    if(!lockedCheck.ok)return {ok:false,message:`No se puede optimizar: ${explainValidation(lockedCheck)}`};
    for(const s of input)if(s.w>this.trailer.width&&!(s.type==='4-way'&&s.canRotate&&s.l<=this.trailer.width))return {ok:false,message:`${s.name||'Una pila'} es más ancha que el tráiler y no tiene una rotación válida.`};
    const solutions=[];
    const compact=this.compact(input); if(compact.ok)solutions.push({name:'Ajuste seguro',stacks:compact.stacks});
    for(const order of this.orders(movable)){const packed=this.pack(order,locked,input);if(packed)solutions.push({name:'Optimización global',stacks:packed});}
    const valid=[],seen=new Set();
    for(const s of solutions){const check=validateLayout(s.stacks,this.trailer);if(!check.ok)continue;const key=s.stacks.map(x=>`${x.id}:${x.x},${x.y},${x.w},${x.l}`).sort().join('|');if(seen.has(key))continue;seen.add(key);Object.assign(s,this.metrics(s.stacks,input));valid.push(s);}
    valid.sort((a,b)=>a.score-b.score);
    return valid.length?{ok:true,solutions:valid.slice(0,3)}:{ok:false,message:'No se encontró ningún acomodo completamente válido dentro del tráiler.'};
  }
}
