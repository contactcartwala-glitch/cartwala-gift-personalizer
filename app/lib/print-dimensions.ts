export function orderedPrintSize(attributes: Record<string,string>) {
 const widthInches=Number(attributes["_Cartwala Print Width"]),heightInches=Number(attributes["_Cartwala Print Height"]);
 if(!(widthInches>0&&heightInches>0))return null;
 const dpi=300,width=Math.round(widthInches*dpi),height=Math.round(heightInches*dpi);
 if(width>16000||height>16000||width*height>100000000)throw new Error("This print size is too large for browser export. Use a smaller print size.");
 return {width,height,dpi};
}
