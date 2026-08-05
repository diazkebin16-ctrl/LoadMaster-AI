(() => {
  "use strict";

  const SCALE = 1.05;
  const EPS = 1e-6;
  const PRESETS = {
    "96x628":[96,628], "96x300":[96,300], "96x330":[96,330],
    "95x574":[95,574], "96x574":[96,574], "95x628":[95,628], "98x628":[98,628]
  };
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
  const roundQuarter = n => Math.round(n*4)/4;

  class Geometry {
    static overlaps(a,b) {
      return !(a.x+a.w <= b.x+EPS || b.x+b.w <= a.x+EPS || a.y+a.l <= b.y+EPS || b.y+b.l <= a.y+EPS);
    }
    static inside(s,trailer) {
      return s.x >= -EPS && s.y >= -EPS && s.x+s.w <= trailer.width+EPS && s.y+s.l <= trailer.length+EPS;
    }
    static valid(s,placed,trailer,ignoreId=null) {
      return Geometry.inside(s,trailer) && !placed.some(o => o.id!==ignoreId && Geometry.overlaps(s,o));
    }
    static usedLength(stacks) {
      return stacks.length ? Math.max(...stacks.map(s=>s.y+s.l)) : 0;
    }
    static floorArea(stacks) { return stacks.reduce((sum,s)=>sum+s.w*s.l,0); }
    static contactScore(s,others,trailer) {
      let score=0;
      if (Math.abs(s.x) < EPS || Math.abs(s.x+s.w-trailer.width)<EPS) score += s.l;
      if (Math.abs(s.y)<EPS) score += s.w;
      others.forEach(o=>{
        const verticalOverlap=Math.max(0,Math.min(s.y+s.l,o.y+o.l)-Math.max(s.y,o.y));
        const horizontalOverlap=Math.max(0,Math.min(s.x+s.w,o.x+o.w)-Math.max(s.x,o.x));
        if(Math.abs(s.x+s.w-o.x)<EPS || Math.abs(o.x+o.w-s.x)<EPS) score += verticalOverlap;
        if(Math.abs(s.y+s.l-o.y)<EPS || Math.abs(o.y+o.l-s.y)<EPS) score += horizontalOverlap;
      });
      return score;
    }
    static candidateAxes(stack,placed,trailer) {
      const xs = new Set([0, trailer.width-stack.w]);
      const ys = new Set([0]);
      placed.forEach(o=>{
        [o.x, o.x+o.w, o.x-stack.w, o.x+o.w-stack.w].forEach(v=>xs.add(roundQuarter(v)));
        [o.y, o.y+o.l, o.y-stack.l, o.y+o.l-stack.l].forEach(v=>ys.add(roundQuarter(v)));
      });
      return {
        xs:[...xs].filter(x=>x>=-EPS && x+stack.w<=trailer.width+EPS).sort((a,b)=>a-b),
        ys:[...ys].filter(y=>y>=-EPS && y+stack.l<=trailer.length+EPS).sort((a,b)=>a-b)
      };
    }
    static candidates(stack,placed,trailer) {
      const axes=Geometry.candidateAxes(stack,placed,trailer);
      const out=[];
      for(const y of axes.ys){
        for(const x of axes.xs){
          const c={...stack,x:roundQuarter(x),y:roundQuarter(y)};
          if(Geometry.valid(c,placed,trailer)) out.push(c);
        }
      }
      return out;
    }
  }

  class LoadEngine {
    constructor(trailer){ this.trailer=clone(trailer); }
    orientations(s){
      const list=[{w:s.w,l:s.l,rotated:!!s.rotated}];
      if(s.type==="4-way" && s.canRotate && Math.abs(s.w-s.l)>EPS){
        list.push({w:s.l,l:s.w,rotated:!s.rotated});
      }
      return list;
    }
    score(stacks, originals=null){
      const used=Geometry.usedLength(stacks);
      const area=Geometry.floorArea(stacks);
      const envelope=Math.max(1,this.trailer.width*used);
      const waste=envelope-area;
      const contacts=stacks.reduce((sum,s)=>sum+Geometry.contactScore(s,stacks.filter(o=>o.id!==s.id),this.trailer),0);
      let movement=0;
      if(originals){
        const map=new Map(originals.map(s=>[s.id,s]));
        stacks.forEach(s=>{ const o=map.get(s.id); if(o) movement+=Math.abs(s.x-o.x)+Math.abs(s.y-o.y); });
      }
      return used*1e8 + waste*1e3 - contacts*10 + movement*0.01;
    }
    localPolish(input){
      let stacks=clone(input);
      const locked=stacks.filter(s=>s.locked);
      const movable=stacks.filter(s=>!s.locked);
      let changed=true, passes=0;
      while(changed && passes<12){
        changed=false; passes++;
        movable.sort((a,b)=>(a.y+a.l)-(b.y+b.l) || a.x-b.x);
        for(const s of movable){
          const others=stacks.filter(o=>o.id!==s.id);
          const before={...s};
          const axes=Geometry.candidateAxes(s,others,this.trailer);
          const candidates=[];
          for(const x of axes.xs){
            const c={...s,x,y:s.y}; if(Geometry.valid(c,others,this.trailer)) candidates.push(c);
          }
          for(const y of axes.ys){
            const c={...s,x:s.x,y}; if(Geometry.valid(c,others,this.trailer)) candidates.push(c);
          }
          for(const c of Geometry.candidates(s,others,this.trailer)) candidates.push(c);
          let best=before;
          let bestKey=this.localKey(before,others,before);
          for(const c of candidates){
            const key=this.localKey(c,others,before);
            if(key<bestKey-EPS){ best=c; bestKey=key; }
          }
          if(Math.abs(best.x-s.x)>EPS || Math.abs(best.y-s.y)>EPS){
            Object.assign(s,best); changed=true;
          }
        }
      }
      return stacks;
    }
    localKey(c,others,origin){
      const used=Math.max(c.y+c.l,...others.map(o=>o.y+o.l),0);
      const contact=Geometry.contactScore(c,others,this.trailer);
      const move=Math.abs(c.x-origin.x)+Math.abs(c.y-origin.y);
      // Largo primero, luego más contacto. Distancia rompe empates y hace que una pila cercana a la pared derecha vaya a esa pared.
      return used*1e8 - contact*1e3 + move;
    }
    orderVariants(stacks){
      const base=clone(stacks);
      const variants=[];
      const add=arr=>variants.push(arr.map(s=>s.id));
      add([...base].sort((a,b)=>b.w*b.l-a.w*a.l));
      add([...base].sort((a,b)=>b.l-a.l || b.w-a.w));
      add([...base].sort((a,b)=>b.w-a.w || b.l-a.l));
      add([...base].sort((a,b)=>(b.w+b.l)-(a.w+a.l)));
      add([...base].sort((a,b)=>a.y-b.y || a.x-b.x));
      for(let i=0;i<8;i++){
        const shuffled=[...base];
        for(let j=shuffled.length-1;j>0;j--){ const k=Math.floor(Math.random()*(j+1)); [shuffled[j],shuffled[k]]=[shuffled[k],shuffled[j]]; }
        add(shuffled);
      }
      return variants;
    }
    packByOrder(allStacks,orderIds,beamWidth=55){
      const locked=clone(allStacks.filter(s=>s.locked));
      if(locked.some((s,i)=>!Geometry.valid(s,locked.slice(0,i),this.trailer))) return null;
      const source=new Map(allStacks.filter(s=>!s.locked).map(s=>[s.id,s]));
      let beams=[locked];
      for(const id of orderIds){
        const original=source.get(id); if(!original) continue;
        const next=[];
        for(const placed of beams){
          for(const orient of this.orientations(original)){
            const shape={...original,...orient,x:0,y:0};
            const candidates=Geometry.candidates(shape,placed,this.trailer).slice(0,160);
            for(const c of candidates) next.push([...placed,c]);
          }
        }
        if(!next.length) return null;
        next.sort((a,b)=>this.score(a,allStacks)-this.score(b,allStacks));
        const unique=[]; const seen=new Set();
        for(const layout of next){
          const key=layout.map(s=>`${s.id}:${s.x},${s.y},${s.w},${s.l}`).sort().join("|");
          if(!seen.has(key)){seen.add(key);unique.push(layout);}
          if(unique.length>=beamWidth) break;
        }
        beams=unique;
      }
      const best=beams.sort((a,b)=>this.score(a,allStacks)-this.score(b,allStacks))[0];
      return best ? this.localPolish(best) : null;
    }
    optimize(input){
      const start=this.localPolish(input);
      const movable=input.filter(s=>!s.locked);
      const candidates=[{name:"Ajuste exacto",stacks:start}];
      for(const order of this.orderVariants(movable)){
        const packed=this.packByOrder(input,order);
        if(packed) candidates.push({name:"Búsqueda global",stacks:packed});
      }
      const unique=[]; const seen=new Set();
      candidates.forEach(c=>{
        const key=c.stacks.map(s=>`${s.id}:${s.x},${s.y},${s.w},${s.l}`).sort().join("|");
        if(!seen.has(key)){seen.add(key); unique.push(c);}
      });
      unique.forEach(c=>{
        c.score=this.score(c.stacks,input);
        c.used=Geometry.usedLength(c.stacks);
        c.efficiency=Geometry.floorArea(c.stacks)/Math.max(1,this.trailer.width*c.used)*100;
        c.moved=c.stacks.filter(s=>{const o=input.find(x=>x.id===s.id);return o&&(Math.abs(o.x-s.x)>EPS||Math.abs(o.y-s.y)>EPS||o.w!==s.w||o.l!==s.l);}).length;
      });
      return unique.sort((a,b)=>a.score-b.score).slice(0,3);
    }
  }

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
      const engine=new LoadEngine(this.state.trailer);const before=clone(this.state.stacks);const after=engine.localPolish(before);
      const moved=after.filter(s=>{const o=before.find(x=>x.id===s.id);return Math.abs(o.x-s.x)>EPS||Math.abs(o.y-s.y)>EPS;}).length;
      if(!moved)return this.toast("La carga ya está compactada");
      this.store.remember();this.state.stacks=after;this.render();this.toast(`Compactación: ${moved} pila${moved===1?"":"s"} ajustada${moved===1?"":"s"}`);
    }
    optimize(){
      if(!this.state.stacks.length)return this.toast("No hay pilas");
      $("optimizerPanel").hidden=false;$("optimizerSummary").textContent="Analizando geometría, rotaciones y espacios libres…";$("optimizerResults").innerHTML="";
      setTimeout(()=>{
        const before=clone(this.state.stacks);const beforeUsed=Geometry.usedLength(before);const engine=new LoadEngine(this.state.trailer);const solutions=engine.optimize(before);this.lastSolutions=solutions;
        if(!solutions.length){$("optimizerSummary").textContent="No se encontró una solución válida.";return;}
        const best=solutions[0];
        this.store.remember();this.state.stacks=clone(best.stacks);this.render();
        const saved=Math.max(0,beforeUsed-best.used);
        $("optimizerSummary").textContent=`Aplicada la mejor solución: ${best.moved} pilas movidas · ${saved.toFixed(1)}\" menos de largo.`;
        this.renderSolutions(solutions,beforeUsed);
        this.toast(best.moved?`IA movió ${best.moved} pila${best.moved===1?"":"s"}`:"La carga ya estaba en la mejor posición encontrada");
      },30);
    }
    renderSolutions(solutions,beforeUsed){
      const root=$("optimizerResults");root.innerHTML="";
      solutions.forEach((sol,i)=>{
        const card=document.createElement("article");card.className="optimizerResult";
        card.innerHTML=`<div><strong>${i===0?"Mejor solución":`Alternativa ${i+1}`}</strong><p>${sol.used.toFixed(1)}\" usados · ${Math.max(0,beforeUsed-sol.used).toFixed(1)}\" ahorro · ${sol.efficiency.toFixed(1)}% eficiencia · ${sol.moved} movidas</p></div><button type="button">Aplicar</button>`;
        card.querySelector("button").onclick=()=>{this.store.remember();this.state.stacks=clone(sol.stacks);this.render();this.toast("Solución aplicada");};root.appendChild(card);
      });
    }
    demo(){
      this.store.remember();this.state.trailer={width:96,length:628};this.state.stacks=[];
      const add=(name,w,l,x,y,qty=20,type="4-way")=>this.state.stacks.push({id:uid(),name,w,l,x,y,qty,type,category:"New",canRotate:type==="4-way",locked:false,rotated:false});
      add("48×40",48,40,0,0);add("48×40",48,40,48,0);add("42×42",42,42,0,42);add("42×42",42,42,54,42);add("Pila desviada",42,42,49,90);
      this.syncTrailerInputs();this.render();
    }
    saveFile(){const blob=new Blob([JSON.stringify({version:"3.0",...this.state},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="loadmaster-carga.json";a.click();URL.revokeObjectURL(a.href);}
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
})();
