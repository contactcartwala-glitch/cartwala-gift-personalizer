import fs from 'node:fs/promises';
import path from 'node:path';
const base=path.resolve('assets/gift-catalog');
const catalog=JSON.parse(await fs.readFile(path.join(base,'catalog.json'),'utf8'));
// Coordinates are percentages of each original image, not a common generic mask.
const photos={
1:[[52,28,35,46]],2:[[38,20,46,29],[38,51,21,22],[61,51,22,22]],3:[[21,16,56,39]],4:[[29,45,41,28]],5:[[26,12,46,49]],
8:[[43,17,43,64,'engraved-dark']],10:[[21,30,14,14],[36,30,14,14],[51,30,14,14],[66,30,14,14],[21,59,14,14],[36,59,14,14],[51,59,14,14],[66,59,14,14]],
12:[[42,52,6,7],[43,59,6,7],[51,53,10,11]],16:[[22,45,57,24]],19:[[39,39,9,12],[40,52,9,12],[42,66,9,12],[51,39,15,24]],
20:[[52,25,37,49,'cutout']],22:[[28,13,46,45]],24:[[26,9,48,51]],25:[[14,32,69,47,'engraved-light']],
26:[[56,34,22,33]],28:[[37,26,38,33,'cutout']],31:[[36,19,23,14],[36,36,23,14],[36,53,23,14]],38:[[31,7,40,46,'engraved-light']],
42:[[48,28,33,30]],44:[[32,19,20,20],[53,19,20,20],[32,40,20,19],[53,40,20,19]],45:[[25,20,20,20],[46,20,20,20],[25,41,20,19],[46,41,20,19]],
47:[[24,23,26,26],[53,23,22,15],[24,52,26,25],[53,40,22,24],[53,65,22,12]],48:[[12,20,68,31]],49:[[25,20,51,42,'cutout']],50:[[24,50,48,30]],
51:[[51,21,29,51,'cutout']],54:[[28,16,22,22],[51,16,22,22],[28,39,22,22],[51,39,22,22]],56:[[32,32,19,29],[53,32,19,29]],
57:[[27,10,22,22],[51,10,28,27],[28,61,25,27],[56,67,23,21]],58:[[13,29,39,49,'engraved-dark']],59:[[32,14,37,36]],60:[[37,26,38,33,'cutout']],
61:[[30,17,43,60,'cutout']],65:[[35,43,16,12],[53,43,12,12],[35,56,16,13],[53,56,12,13]],67:[[24,12,53,35],[25,49,27,25],[54,49,23,25]],
69:[[21,11,59,34],[21,46,27,25],[50,46,30,25]],73:[[23,30,38,35]]
};
// sample, center x/y, text width/height, font size as fraction of image width.
const names={
1:['Radha & Krishna',68,25,34,8,0.044],6:['CJP PARTY',61,59,42,18,0.09],7:['Adv. Rakesh Chaudhary',55,60,54,8,0.039],
9:['Kavish',51,72,48,10,0.075],11:['Muskan',52,39,52,10,0.075],13:['Ishita',49,64,42,8,0.06],15:['Aayushi',50,67,53,10,0.075],
17:['Raj & Simran',49,26,71,10,0.062],18:['Khushi',55,62,49,9,0.073],20:['Vamshi & Shalini',35,45,26,18,0.034],
21:['Muhammad & Aleena',55,59,39,18,0.04],23:['Sweety',54,63,46,10,0.071],25:['Elena & Ryan',48,21,58,10,0.064],
26:['Sakshi',33,50,31,9,0.055],27:['Piyush',54,66,40,14,0.085],28:['Anushka & Rohit',52,68,58,10,0.058],
29:['Siddharth',50,68,68,11,0.083],30:['Nishith & Kashvi',66,43,36,9,0.04],32:['Mia',33,56,36,12,0.098],
34:['Sweety',57,49,61,15,0.09],35:['Lavya',68,34,33,10,0.068],36:['Swati',50,42,48,9,0.075],37:['Riddhi',51,67,45,9,0.075],
38:['Adv. Jaspreet Singh',63,60,48,8,0.05],39:['Arnav',54,37,52,10,0.079],40:['Parth',68,36,33,10,0.077],
43:['Sadik & Neeru',53,52,35,9,0.035],46:['Arnav',54,41,52,10,0.079],48:['Akriti & Sanju',47,63,61,10,0.07],
49:['Sahil & Ravan',49,69,57,10,0.055],51:['PIYUSH & ANGALE',70,15,34,9,0.04],52:['Eesha',54,32,48,10,0.084],
53:['Madhu',50,68,61,11,0.079],55:['Maria',52,43,49,10,0.081],56:['Aniket - Sonia',54,29,29,7,0.03],
57:['Bhawna  Kavita  Neha',52,45,53,5,0.02],58:['Rohit & Priya',70,33,40,11,0.057],60:['Anushka & Rohit',52,68,58,10,0.058],
64:['Sahil & Naaz',53,72,48,10,0.05],68:['Aviray',55,25,49,10,0.075],70:['Vansh',53,27,58,12,0.09],71:['Nishith & Kashvi',60,42,33,8,0.037]
};
const dates={3:['22.11.2025',50,67,39,4,0.023],13:['28.11.2023',49,69,29,3,0.018],20:['06.02.2022',35,59,22,5,0.023],21:['21.12.2025',55,72,37,5,0.025],
25:['14.02.2024',48,25,36,4,0.022],26:['30.05.1999',33,59,31,7,0.038],28:['14.02.2026',52,83,41,5,0.03],39:['05.02.2003',54,43,31,4,0.018],
46:['05.02.2003',54,46,31,4,0.018],48:['06.08.2021',47,71,36,4,0.025],60:['14.02.2026',52,83,41,5,0.03],64:['06.02.2023',53,78,33,4,0.018]};
names[3]=['Ansh & Sonia',50,61,49,10,0.065];
const quotes={
14:['COACH\n(noun)\n1. One who inspires dreams, and motivates you to achieve them.\n2. A person who builds your character and potential through belief and encouragement.\n3. Someone who touches your life forever.',58,46,53,47,0.031],
33:['IN CASE NOBODY TOLD YOU TODAY...\nYOU ARE AMAZING\nYOU ARE IMPORTANT\nYOU MAKE A DIFFERENCE\nYOU ARE INCREDIBLY\nAPPRECIATED\n& YOU DESERVE THE BEST!\n(SO KEEP ON BEING YOU, BECAUSE\nTHE WORLD NEEDS MORE OF WHO YOU ARE!)',49,42,68,68,0.035],
41:['There are\nPEOPLE IN THIS WORLD\nWHO MAKE THINGS\nbetter\nWHEREVER THEY GO\nThank You\nFOR BEING\nONE OF THEM',49,43,69,63,0.038],
62:['THANK YOU\nFOR THE AMAZING\nPERSON YOU ARE,\nFOR ALL THAT YOU DO &\nTHE DIFFERENCE\nYOU MAKE.\nYOU ARE TRULY\nappreciated.',52,39,67,63,0.038],
63:["A True Friend\nIS HARD TO FIND\nTHEY ARE RARE & ONE OF A KIND.\nI DON'T CARE\nIF I ONLY HAVE A FEW.\nI KNOW I HAVE ONE OF\nTHE BEST\nThat friend is you!",51,46,63,61,0.037],
66:['In case nobody told you today...\nYOU ARE AMAZING\nYOU ARE IMPORTANT\nYOU MAKE A DIFFERENCE\nYOU ARE INCREDIBLY\nAPPRECIATED\nAND YOU DESERVE THE BEST\n(So keep on being you, because\nthe world needs more of who you are!)',57,49,57,44,0.025],
72:['WHEN PENGUINS FIND\nTHEIR MATE, THEY STAY\nTOGETHER FOREVER.',60,34,43,17,0.025]
};
const extra={
1:[['Message','Thank you for making me\nlaugh and smile every single\nday since the day we met',31,66,36,15,0.027]],
2:[['Message','Our greatest blessing, our beautiful daughter.',61,77,46,7,0.025]],
7:[['Degree','B.A. LLB',56,68,44,8,0.054]],38:[['Degree','B.A. LLB',64,67,35,7,0.045]],
72:[['Message','YOU ARE\nmy penguin',63,74,40,13,0.034]]};
const calendars={1:{x:17,y:31,width:31,height:22,month:'January',monthX:23,monthY:26,day:17},8:{x:8,y:37,width:30,height:28,month:'September',monthX:21,monthY:34,day:6},51:{x:19,y:21,width:26,height:23,month:'February',monthX:31,monthY:18,day:6},58:{x:56,y:47,width:27,height:22,month:'August',monthX:69,monthY:43,day:21}};
for(const product of catalog.products){
 try {await fs.access(path.join(base,product.sku+'.spec.json'));continue;} catch {}
 const n=Number(product.sku.slice(-3));
 const textFields=[];
 const add=(id,label,data,font='Z003')=>{if(!data)return;const [sample,x,y,width,height,size]=data;textFields.push({id,label,sample,x,y,width,height,size,fontFamily:font,color:[14,33,41,58,62,63,66,72].includes(n)?'#352719':'#fff2bc'});};
 add('name','Name',names[n]);add('date','Date',dates[n],'DejaVu Sans');add('message','Message',quotes[n],'DejaVu Serif');
 for(const [label,...data] of extra[n]||[])add(label.toLowerCase(),label,data);
 const entries=(photos[n]||[]).map((a,i)=>{const [x,y,width,height,treatment='printed']=a;return {id:'photo-'+(i+1),label:'Photo '+(i+1),guide:{x,y,width,height},treatment,maskMode:treatment==='printed'?'detect-grey':'manual'};});
 if(entries.length!==product.photoCount)throw Error(product.sku+' photo count mismatch');
 const spec={sku:product.sku,title:product.title,productId:product.id,handle:product.handle,source:'sources/'+product.sku+'.webp',background:product.sku+'-background.png',photos:entries,textFields,calendar:calendars[n]||null,reviewStatus:'authoring',productionArtworkStatus:'mockup-only'};
 await fs.writeFile(path.join(base,product.sku+'.spec.json'),JSON.stringify(spec,null,2)+'\n');
}
console.log('73 product-specific specifications available; existing reviewed layouts preserved.');
