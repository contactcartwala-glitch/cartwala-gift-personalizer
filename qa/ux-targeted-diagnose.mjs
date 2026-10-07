import { chromium, firefox, webkit } from "@playwright/test";

const BASE="https://cartwala.in";
const pages=[
  "/products/12-months-baby-photo-frame",
  "/products/personalized-birthday-black-gold-luxury-love-mug",
  "/products/water-bottle",
  "/products/customized-photo-t-shirts",
  "/products/best-mom-personalized-photo-pillow"
];

const describe=async(page,label)=>{
  const data=await page.evaluate(()=>{
    const vw=document.documentElement.clientWidth;
    const sw=Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0);
    const visible=el=>{
      const s=getComputedStyle(el),r=el.getBoundingClientRect();
      return s.display!=="none"&&s.visibility!=="hidden"&&r.width>0&&r.height>0;
    };
    const path=el=>{
      const bits=[];
      let n=el;
      for(let i=0;n&&n!==document.body&&i<5;i++,n=n.parentElement){
        let bit=n.tagName.toLowerCase();
        if(n.id)bit+="#"+n.id;
        const cls=[...n.classList].slice(0,3);
        if(cls.length)bit+="."+cls.join(".");
        bits.unshift(bit);
      }
      return bits.join(" > ");
    };
    const offenders=[...document.querySelectorAll("body *")]
      .filter(visible)
      .map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {
        path:path(el),tag:el.tagName,cls:el.className?.toString?.().slice(0,180)||"",
        text:(el.textContent||"").replace(/\s+/g," ").trim().slice(0,90),
        left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),
        scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
        position:s.position,display:s.display,boxSizing:s.boxSizing,
        marginLeft:s.marginLeft,marginRight:s.marginRight,
        paddingLeft:s.paddingLeft,paddingRight:s.paddingRight,
        transform:s.transform,overflowX:s.overflowX
      }})
      .filter(x=>x.right>vw+1||x.left<-1||x.scrollWidth>x.clientWidth+8)
      .sort((a,b)=>Math.max(b.right-vw,b.scrollWidth-b.clientWidth)-Math.max(a.right-vw,a.scrollWidth-a.clientWidth))
      .slice(0,25);
    return {vw,sw,overflow:sw-vw,offenders};
  });
  console.log("\n=== "+label+" ===");
  console.log(JSON.stringify(data,null,2));
};

for(const [name,type] of [["webkit",webkit],["firefox",firefox]]){
  const browser=await type.launch({headless:true});
  for(const pathname of pages){
    const page=await browser.newPage({viewport:{width:320,height:568}});
    await page.goto(BASE+pathname,{waitUntil:"domcontentloaded",timeout:30000});
    await page.waitForLoadState("networkidle",{timeout:5000}).catch(()=>{});
    await page.waitForTimeout(1000);
    await describe(page,name+" 320 "+pathname);
    await page.close();
  }
  await browser.close();
}

{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const pathname="/products/customized-photo-frame-black-beading";
  await page.goto(BASE+pathname,{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForLoadState("networkidle",{timeout:5000}).catch(()=>{});
  await page.waitForTimeout(1000);
  await describe(page,"chromium 390 frame before personalization");

  const clickText=async text=>{
    const loc=page.getByText(text,{exact:true}).last();
    if(await loc.count())await loc.click({force:true});
  };
  await clickText("24x36");
  await page.waitForTimeout(400);
  const open=page.locator('[data-cw-personalizer][data-cw-photo-frame-master="true"] [data-cw-open]').first();
  if(await open.count()){
    await open.click({force:true});
    const file=page.locator('[data-cw-personalizer][data-cw-photo-frame-master="true"] input[type="file"]').first();
    if(await file.count()){
      const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAADZSiLoAAAAD0lEQVR42mP4z8DAwMAAAA0AAf4CBM8AAAAASUVORK5CYII=","base64");
      await file.setInputFiles({name:"qa.png",mimeType:"image/png",buffer:png});
      await page.waitForTimeout(800);
      const save=page.locator('[data-cw-personalizer][data-cw-photo-frame-master="true"] [data-cw-save]').first();
      if(await save.count()){
        await save.click({force:true});
        await page.waitForTimeout(1400);
      }
    }
  }

  const galleryState=async label=>{
    const s=await page.evaluate(()=>{
      const visible=img=>{const r=img.getBoundingClientRect(),st=getComputedStyle(img);return r.width>0&&r.height>0&&st.display!=="none"&&st.visibility!=="hidden"};
      return [...document.querySelectorAll("img[data-cw-frame-kind]")].map((img,i)=>{
        const r=img.getBoundingClientRect();
        const anc=img.closest("button,a,[role=button],li,slider-component");
        return {i,kind:img.dataset.cwFrameKind,base:img.dataset.cwFrameBase?.slice(-100),src:(img.currentSrc||img.src).slice(0,120),w:Math.round(r.width),h:Math.round(r.height),visible:visible(img),ancestor:anc?anc.tagName+"."+(anc.className||""):""};
      });
    });
    console.log("\n=== "+label+" ===");
    console.log(JSON.stringify(s,null,2));
  };
  await galleryState("frame gallery before guide click");
  const guide=page.locator('img[data-cw-frame-kind="guide"]').first();
  if(await guide.count()){
    console.log("GUIDE FOUND",await guide.evaluate(img=>({outer:img.outerHTML.slice(0,500),parent:img.parentElement?.outerHTML.slice(0,900)})));
    await guide.click({force:true});
    await page.waitForTimeout(700);
    await galleryState("frame gallery after direct guide img click");
  }else{
    console.log("GUIDE NOT FOUND");
  }
  await browser.close();
}
