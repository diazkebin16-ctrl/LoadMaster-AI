import { Geometry } from './geometry.js';
export class CollisionIndex {
  constructor(trailer,stacks=[]){this.trailer=trailer;this.stacks=[...stacks];}
  canPlace(s,ignoreId=null){return Geometry.valid(s,this.stacks,this.trailer,ignoreId);}
  add(s){if(!this.canPlace(s))return false;this.stacks.push(s);return true;}
}
