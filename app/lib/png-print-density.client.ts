/** Set 300 DPI physical metadata without recompressing the print pixels. */
export async function printPngWithDpi(blob:Blob,dpi=300) {
 const bytes=new Uint8Array(await blob.arrayBuffer()),parts:BlobPart[]=[bytes.slice(0,8)];
 const chunk=new Uint8Array(21),view=new DataView(chunk.buffer),pixelsPerMeter=Math.round(dpi/0.0254);
 view.setUint32(0,9);chunk.set([112,72,89,115],4);view.setUint32(8,pixelsPerMeter);view.setUint32(12,pixelsPerMeter);chunk[16]=1;
 let crc=0xffffffff;for(const byte of chunk.slice(4,17)){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}view.setUint32(17,(crc^0xffffffff)>>>0);
 for(let offset=8;offset+12<=bytes.length;){const length=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0),end=offset+length+12;if(end>bytes.length)throw new Error("Invalid generated PNG.");const type=String.fromCharCode(...bytes.slice(offset+4,offset+8));if(type!=="pHYs")parts.push(bytes.slice(offset,end));if(type==="IHDR")parts.push(chunk);offset=end;}
 return new Blob(parts,{type:"image/png"});
}
