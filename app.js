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
  const contacts=stacks.reduce((sum,s)=>sum+Geometry.contactScore(s,stacks.filter(o=>o.id!==s.id),trailer),0);
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

class LoadEngine {
  constructor(trailer){ this.trailer=Geometry.clone(trailer); }

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
    let seed=2166136261;
    for(const s of movable)for(const ch of String(s.id))seed=(seed^ch.charCodeAt(0))*16777619>>>0;
    const rnd=()=>((seed=1664525*seed+1013904223>>>0)/4294967296);
    for(let k=0;k<18;k++){
      const a=[...movable];
      for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
      variants.push(a);
    }
    return variants;
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
      const next=[];
      for(const placed of beams){
        for(const c of this.placementOptions(original,placed,36))next.push([...placed,c]);
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
    for(const beam of beams.slice(0,12)){
      const polished=this.sequenceRefine(beam,originals,5);
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
      let changed=false;
      const ids=layout.filter(s=>!s.locked).sort((a,b)=>(b.y+b.l)-(a.y+a.l)).map(s=>s.id);
      for(const id of ids){
        const move=this.bestSingleMove(layout,id,originals,80);
        if(move){layout=layout.map(s=>s.id===id?move.piece:s);changed=true;}
      }
      if(changed)continue;

      // Búsqueda de dos acciones: girar/mover una pila aunque la primera acción
      // no sea mejor por sí sola, para permitir que una segunda pila ocupe el hueco abierto.
      const baseScore=layoutScore(layout,this.trailer,originals);
      let bestLayout=null,bestScore=baseScore;
      const focus=layout.filter(s=>!s.locked).sort((a,b)=>(b.y+b.l)-(a.y+a.l)).slice(0,14);
      for(const first of focus){
        const withoutFirst=layout.filter(s=>s.id!==first.id);
        const firstOptions=this.placementOptions(first,withoutFirst,22);
        for(const p1 of firstOptions){
          const stage1=[...withoutFirst,p1];
          if(!validateLayout(stage1,this.trailer).ok)continue;
          const secondIds=stage1.filter(s=>!s.locked&&s.id!==first.id).sort((a,b)=>(b.y+b.l)-(a.y+a.l)).slice(0,10).map(s=>s.id);
          for(const secondId of secondIds){
            const second=this.bestSingleMove(stage1,secondId,originals,30);
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

  optimize(input){
    const locked=input.filter(s=>s.locked), movable=input.filter(s=>!s.locked);
    const lockedCheck=validateLayout(locked,this.trailer);
    if(!lockedCheck.ok)return {ok:false,message:`No se puede optimizar: ${explainValidation(lockedCheck)}`};
    for(const s of input){
      const fitsNormal=s.w<=this.trailer.width+EPS;
      const fitsRotated=isFourWay(s)&&s.canRotate!==false&&s.l<=this.trailer.width+EPS;
      if(!fitsNormal&&!fitsRotated)return {ok:false,message:`${s.name||'Una pila'} es más ancha que el tráiler y no tiene una rotación válida.`};
    }

    const solutions=[];
    if(validateLayout(input,this.trailer).ok){
      const local=this.sequenceRefine(input,input,10);
      if(validateLayout(local,this.trailer).ok)solutions.push({name:'Ajuste con rotaciones',stacks:local});
    }

    for(const order of this.orders(movable)){
      const packed=this.pack(order,locked,input,120);
      if(packed)solutions.push({name:'Optimización global',stacks:packed});
    }

    const valid=[],seen=new Set();
    for(const s of solutions){
      const check=validateLayout(s.stacks,this.trailer);
      if(!check.ok)continue;
      const key=s.stacks.map(x=>`${x.id}:${x.x},${x.y},${x.w},${x.l}`).sort().join('|');
      if(seen.has(key))continue;
      seen.add(key);Object.assign(s,this.metrics(s.stacks,input));valid.push(s);
    }
    valid.sort((a,b)=>a.score-b.score);
    return valid.length?{ok:true,solutions:valid.slice(0,3)}:{ok:false,message:'No se encontró un acomodo válido. La IA probó movimientos y rotaciones permitidas, pero ninguna secuencia completa pasó la validación.'};
  }
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

  class Store {
    constructor(){
      this.state={trailer:{width:96,length:628},stacks:[],library:[],selectedId:null};
      this.history=[]; this.future=[];
      try{this.state.library=JSON.parse(localStorage.getItem("loadmaster-library")||"[]");}catch{}
    }
    snapshot(){return JSON.stringify(this.state);}
    remember(){this.history.push(this.snapshot()); if(this.history.length>80)this.history.shift(); this.future=[];}
    restore(raw){this.state=JSON.parse(raw); this.persistLibrary();}
    persistLibrary(){localStorage.setItem("loadmaster-library",JSON.stringify(this.state.library));}
  }

  class App {
    constructor(){
      this.store=new Store(); this.installPrompt=null; this.lastSolutions=[];
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
      $("trailerPreset").onchange=e=>{const v=PRESETS[e.target.value];if(v){$("trailerWidth").value=v[0];$("trailerLength").value=v[1];}};
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
      $("closeOptimizer").onclick=()=>$("optimizerPanel").hidden=true;
      $("trailer").onclick=e=>{if(e.target===$("trailer")||e.target.classList.contains("freeZone")){this.state.selectedId=null;this.render();}};
    }
    loadLibrarySelection(){
      const item=this.state.library.find(x=>x.id===$("librarySelect").value); if(!item)return;
      $("palletWidth").value=item.w;$("palletLength").value=item.l;$("maxHeight").value=item.maxHeight;$("palletType").value=item.type;$("category").value=item.category;$("canRotate").checked=item.canRotate;$("palletName").value=item.name;
    }
    saveLibraryItem(){
      const item={id:uid(),name:$("palletName").value.trim()||"Pallet",w:+$("palletWidth").value,l:+$("palletLength").value,maxHeight:+$("maxHeight").value,type:$("palletType").value,category:$("category").value,canRotate:$("canRotate").checked};
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
      if(!this.state.stacks.length)return this.toast("No hay pilas");
      $("optimizerPanel").hidden=false;$("optimizerSummary").textContent="Analizando geometría, rotaciones y espacios libres…";$("optimizerResults").innerHTML="";
      setTimeout(()=>{
        const before=clone(this.state.stacks);const beforeUsed=Geometry.usedLength(before);const engine=new LoadEngine(this.state.trailer);const report=engine.optimize(before);
        if(!report.ok){$("optimizerSummary").textContent=report.message;this.toast(report.message);return;}
        const solutions=report.solutions;this.lastSolutions=solutions;
        if(!solutions.length){$("optimizerSummary").textContent="No se encontró una solución válida.";return;}
        const best=solutions[0];
        const validation=validateLayout(best.stacks,this.state.trailer);
        if(!validation.ok){$("optimizerSummary").textContent=`Solución rechazada: ${explainValidation(validation)}`;return;}
        this.store.remember();this.state.stacks=clone(best.stacks);this.render();
        const saved=Math.max(0,beforeUsed-best.used);
        const moveDetails=best.stacks.map(s=>{const o=before.find(x=>x.id===s.id);if(!o)return null;const dx=s.x-o.x,dy=s.y-o.y;return (Math.abs(dx)>EPS||Math.abs(dy)>EPS)?`${s.name}: x ${o.x.toFixed(1)}→${s.x.toFixed(1)}, y ${o.y.toFixed(1)}→${s.y.toFixed(1)}`:null;}).filter(Boolean);
        $("optimizerSummary").textContent=`Aplicada la mejor solución: ${best.moved} pilas movidas · ${saved.toFixed(1)}\" menos de largo.${moveDetails.length?" "+moveDetails.slice(0,3).join(" · "):""}`;
        this.renderSolutions(solutions,beforeUsed);
        this.toast(best.moved?`IA movió ${best.moved} pila${best.moved===1?"":"s"}`:"La carga ya estaba en la mejor posición encontrada");
      },30);
    }
    renderSolutions(solutions,beforeUsed){
      const root=$("optimizerResults");root.innerHTML="";
      solutions.forEach((sol,i)=>{
        const card=document.createElement("article");card.className="optimizerResult";
        card.innerHTML=`<div><strong>${i===0?"Mejor solución":`Alternativa ${i+1}`}</strong><p>${sol.used.toFixed(1)}\" usados · ${Math.max(0,beforeUsed-sol.used).toFixed(1)}\" ahorro · ${sol.efficiency.toFixed(1)}% eficiencia · ${sol.moved} movidas · ${sol.rotated||0} giradas</p></div><button type="button">Aplicar</button>`;
        card.querySelector("button").onclick=()=>{const validation=validateLayout(sol.stacks,this.state.trailer);if(!validation.ok)return this.toast(`Solución inválida: ${explainValidation(validation)}`);this.store.remember();this.state.stacks=clone(sol.stacks);this.render();this.toast("Solución validada y aplicada");};root.appendChild(card);
      });
    }
    demo(){
      this.store.remember();this.state.trailer={width:96,length:628};this.state.stacks=[];
      const add=(name,w,l,x,y,qty=20,type="4-way")=>this.state.stacks.push({id:uid(),name,w,l,x,y,qty,type,category:"New",canRotate:type==="4-way",locked:false,rotated:false});
      add("48×40",48,40,0,0);add("48×40",48,40,48,0);add("42×42",42,42,0,42);add("42×42",42,42,54,42);add("Pila desviada",42,42,49,90);
      this.syncTrailerInputs();this.render();
    }
    saveFile(){const blob=new Blob([JSON.stringify({version:"4.2",...this.state},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="loadmaster-carga.json";a.click();URL.revokeObjectURL(a.href);}
    async openFile(e){const file=e.target.files[0];if(!file)return;try{const d=JSON.parse(await file.text());this.store.remember();this.state.trailer=d.trailer||this.state.trailer;this.state.stacks=d.stacks||[];this.state.library=d.library||this.state.library;this.state.selectedId=null;this.store.persistLibrary();this.syncTrailerInputs();this.render();this.toast("Carga abierta");}catch{this.toast("Archivo no válido");}e.target.value="";}
    renderLibrary(){const sel=$("librarySelect"),current=sel.value;sel.innerHTML='<option value="">— Nueva medida —</option>';this.state.library.forEach(item=>{const o=document.createElement("option");o.value=item.id;o.textContent=`${item.name} · ${item.type} · máx ${item.maxHeight}`;sel.appendChild(o);});if([...sel.options].some(o=>o.value===current))sel.value=current;}
    render(){
      const trailer=$("trailer");trailer.style.width=`${this.state.trailer.width*SCALE}px`;trailer.style.height=`${this.state.trailer.length*SCALE}px`;trailer.querySelectorAll(".stack").forEach(n=>n.remove());
      this.state.stacks.forEach(s=>{const el=document.createElement("div");el.className="stack"+(s.id===this.state.selectedId?" selected":"")+(s.locked?" locked":"")+(this.valid(s)?"":" invalid");el.dataset.id=s.id;el.style.left=`${s.x*SCALE}px`;el.style.top=`${s.y*SCALE}px`;el.style.width=`${s.w*SCALE}px`;el.style.height=`${s.l*SCALE}px`;el.innerHTML=`${s.name}<small>${s.qty} alto · ${s.type}</small>`;trailer.appendChild(el);this.wireDrag(el,s);});
      this.renderLibrary();this.renderSelection();this.renderMetrics();
    }
    renderSelection(){const s=this.selected();$("selectedInfo").textContent=s?`${s.name} · ${s.qty} alto · ${s.type} · ${s.category}${s.locked?" · bloqueada":""}`:"Ninguna seleccionada";$("floatingTools").hidden=!s;if(s){$("bottomSelectedName").textContent=`${s.name} · ${s.qty} alto · ${s.type}`;$("floatLockBtn").textContent=s.locked?"🔓 Desbloq.":"🔒 Bloq.";const can=s.type==="4-way"&&s.canRotate&&s.w!==s.l;$("floatRotateBtn").disabled=!can;}}
    renderMetrics(){const used=Geometry.usedLength(this.state.stacks),free=Math.max(0,this.state.trailer.length-used),area=Geometry.floorArea(this.state.stacks),total=this.state.trailer.width*this.state.trailer.length,env=Math.max(1,this.state.trailer.width*used);$("metricStacks").textContent=this.state.stacks.length;$("metricPallets").textContent=this.state.stacks.reduce((a,s)=>a+s.qty,0);$("metricUsed").textContent=`${used.toFixed(1)}\"`;$("metricFree").textContent=`${free.toFixed(1)}\"`;$("metricUtilization").textContent=`${Math.min(100,area/Math.max(1,total)*100).toFixed(1)}%`;$("metricEfficiency").textContent=`${Math.min(100,area/env*100).toFixed(1)}%`;const bad=this.state.stacks.some(s=>!this.valid(s));$("metricStatus").textContent=bad?"Hay conflicto":"Carga válida";$("metricStatus").style.color=bad?"#dc2626":"#16a34a";$("freeZone").style.top=`${used*SCALE}px`;$("freeZone").style.height=`${free*SCALE}px`;}
    wireDrag(el,s){let active=false,startX=0,startY=0,origin=null,before=null,moved=false;el.onpointerdown=e=>{e.preventDefault();e.stopPropagation();this.state.selectedId=s.id;this.renderSelection();if(s.locked)return this.toast("Esta pila está bloqueada");active=true;startX=e.clientX;startY=e.clientY;origin={x:s.x,y:s.y};before=this.store.snapshot();moved=false;el.setPointerCapture?.(e.pointerId);};el.onpointermove=e=>{if(!active)return;const dx=(e.clientX-startX)/SCALE,dy=(e.clientY-startY)/SCALE;if(Math.abs(dx)>0.5||Math.abs(dy)>0.5)moved=true;s.x=roundQuarter(origin.x+dx);s.y=roundQuarter(origin.y+dy);el.style.left=`${s.x*SCALE}px`;el.style.top=`${s.y*SCALE}px`;el.classList.toggle("invalid",!this.valid(s));this.renderMetrics();};const finish=()=>{if(!active)return;active=false;if(moved){this.store.history.push(before);this.store.future=[];const others=this.state.stacks.filter(o=>o.id!==s.id);const axes=Geometry.candidateAxes(s,others,this.state.trailer);const nx=[...axes.xs].sort((a,b)=>Math.abs(a-s.x)-Math.abs(b-s.x))[0],ny=[...axes.ys].sort((a,b)=>Math.abs(a-s.y)-Math.abs(b-s.y))[0];const test={...s,x:nx,y:ny};if(Math.abs(nx-s.x)<=4&&Geometry.valid(test,others,this.state.trailer))s.x=nx;const test2={...s,y:ny};if(Math.abs(ny-s.y)<=4&&Geometry.valid(test2,others,this.state.trailer))s.y=ny;this.render();}};el.onpointerup=finish;el.onpointercancel=finish;}
  }



new App();