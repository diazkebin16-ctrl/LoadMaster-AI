export const EPS = 1e-7;
export const roundQuarter = n => Math.round(n * 4) / 4;

export class Geometry {
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
