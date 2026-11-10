import { WH, WW } from './constants.js';

export let G=null,P=null;
export const M={map:null,own:null,vis:new Uint8Array(WW*WH),dmap:null,land:null,stars:null};
export const V={tab:'station',tags:true,hover:null,ecam:null,ez:1,modalQ:[],fx:[],strikes:[],sec:0};
export function setG(game){G=game}
export function setP(player){P=player}
