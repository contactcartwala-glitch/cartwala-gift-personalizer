import PNGModule from "@pdf-lib/upng";
import { inflateRawSync } from "node:zlib";
// The package ships a nested default export when loaded by Node ESM.
const UPNG=(PNGModule as unknown as {default?:typeof PNGModule}).default||PNGModule;
// Reject damaged compressed streams promptly with Node's bounded inflater.
// The bundled JavaScript inflater can loop on truncated PNG data.
(UPNG as unknown as {inflateRaw:(input:Uint8Array,output?:Uint8Array)=>Uint8Array}).inflateRaw=(input,output)=>{
 const inflated=inflateRawSync(input,{maxOutputLength:output?.byteLength||64*1024*1024});
 if(output){output.set(inflated);return output;}return new Uint8Array(inflated);
};

/** Finds one enclosed transparent photo opening. No merchant coordinates needed. */
export function inspectMockupPng(bytes: ArrayBuffer, expectedRatio: number) {
 const raw=new Uint8Array(bytes),view=new DataView(bytes);
 if(raw.length<33 || [137,80,78,71,13,10,26,10].some((v,i)=>raw[i]!==v))throw new Error("Choose a PNG file exported with transparency.");
 const width=view.getUint32(16),height=view.getUint32(20);
 if(width<64||height<64||width>4096||height>4096||width*height>12000000)throw new Error("Use a PNG between 64 and 4096 pixels per side, up to 12 megapixels.");
 if(bytes.byteLength>20*1024*1024)throw new Error("Use a PNG smaller than 20 MB.");
 let decoded:ReturnType<typeof UPNG.decode>;
 try{decoded=UPNG.decode(bytes);}catch{throw new Error("This PNG could not be read. Export it again from Photoshop.");}
 if(decoded.tabs.acTL)throw new Error("Use a still PNG, not an animated PNG.");
 const rgba=new Uint8Array(UPNG.toRGBA8(decoded)[0]);
 const scale=Math.min(1,512/Math.max(width,height)),sw=Math.max(1,Math.round(width*scale)),sh=Math.max(1,Math.round(height*scale));
 const state=new Uint8Array(sw*sh),queue=new Int32Array(sw*sh);
 for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const px=Math.min(width-1,Math.floor((x+.5)*width/sw)),py=Math.min(height-1,Math.floor((y+.5)*height/sh));state[y*sw+x]=rgba[(py*width+px)*4+3]<=32?1:0;}
 const holes:Array<{count:number;left:number;right:number;top:number;bottom:number}>=[];
 for(let start=0;start<state.length;start++){
  if(state[start]!==1)continue;let head=0,tail=1,left=sw,right=0,top=sh,bottom=0,edge=false;queue[0]=start;state[start]=2;
  while(head<tail){const index=queue[head++],x=index%sw,y=Math.floor(index/sw);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);if(!x||!y||x===sw-1||y===sh-1)edge=true;
   const add=(n:number)=>{if(state[n]===1){state[n]=2;queue[tail++]=n;}};if(x)add(index-1);if(x<sw-1)add(index+1);if(y)add(index-sw);if(y<sh-1)add(index+sw);
  }
  if(!edge&&tail>sw*sh*.0025)holes.push({count:tail,left,right,top,bottom});
 }
 holes.sort((a,b)=>b.count-a.count);const hole=holes[0];
 if(!hole)throw new Error("No photo opening found. Keep one rectangular photo area transparent, fully surrounded by the mockup.");
 if(holes[1]&&holes[1].count>hole.count*.1)throw new Error("More than one photo opening was found. Use one transparent opening for the complete product design.");
 if(hole.count/((hole.right-hole.left+1)*(hole.bottom-hole.top+1))<.84)throw new Error("Use a straight, front-facing rectangular photo opening. Angled or irregular openings are not supported.");
 let left=width,right=-1,top=height,bottom=-1;
 for(let y=Math.max(0,Math.floor((hole.top-1)*height/sh));y<Math.min(height,Math.ceil((hole.bottom+2)*height/sh));y++)for(let x=Math.max(0,Math.floor((hole.left-1)*width/sw));x<Math.min(width,Math.ceil((hole.right+2)*width/sw));x++)if(rgba[(y*width+x)*4+3]<=32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 const w=right-left+1,h=bottom-top+1,ratio=w/h;
 if(!Number.isFinite(expectedRatio)||Math.abs(ratio/expectedRatio-1)>.08)throw new Error("The transparent opening does not match this size and direction. Check Portrait / Landscape and export the matching PNG.");
 return {x:(left+w/2)/width*100,y:(top+h/2)/height*100,width:w/width*100,height:h/height*100,mockupAspect:width/height};
}
