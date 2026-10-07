import { chromium, firefox, webkit } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL=(process.env.BASE_URL||"https://cartwala.in").replace(/\/$/,"");
const MAX_URLS=Math.max(10,Number(process.env.QA_MAX_URLS||600));
const OUTPUT_DIR=path.resolve(process.env.QA_OUTPUT_DIR||"qa-output");
const STRICT=String(process.env.QA_STRICT||"1")!=="0";
const NAV_TIMEOUT=18000;
const WAIT_AFTER_LOAD=650;
const results=[];
const startedAt=new Date().toISOString();

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const safeName=(value)=>String(value).replace(/^https?:\/\//,"").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").slice(0,110)||"page";
const sameOrigin=url=>{try{return new URL(url).origin===new URL(BASE_URL).origin}catch{return false}};
const normalizeUrl=url=>{try{const u=new URL(url,BASE_URL);u.hash="";return u.href}catch{return null}};
const decodeXml=s=>String(s).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");

async function ensureOutput(){
  await fs.rm(OUTPUT_DIR,{recursive:true,force:true});
  await fs.mkdir(path.join(OUTPUT_DIR,"screenshots"),{recursive:true});
}

async function discoverUrls(){
  const seenSitemaps=new Set();
  const pages=new Set([BASE_URL+"/"]);
  async function readSitemap(url,depth=0){
    if(depth>3||seenSitemaps.has(url))return;
    seenSitemaps.add(url);
    try{
      const response=await fetch(url,{headers:{"user-agent":"Cartwala-UX-Audit/1.0"}});
      if(!response.ok)return;
      const xml=await response.text();
      const locs=[...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m=>decodeXml(m[1].trim()));
      const sitemapIndex=/<sitemapindex[\s>]/i.test(xml);
      if(sitemapIndex){
        for(const loc of locs) await readSitemap(loc,depth+1);
      }else{
        for(const loc of locs){
          const normalized=normalizeUrl(loc);
          if(!normalized||!sameOrigin(normalized))continue;
          const u=new URL(normalized);
          if(/\.(xml|jpg|jpeg|png|webp|gif|svg|pdf)(\?|$)/i.test(u.pathname))continue;
          pages.add(normalized);
        }
      }
    }catch(error){
      console.warn("Sitemap read failed:",url,error.message);
    }
  }
  await readSitemap(BASE_URL+"/sitemap.xml");
  const all=[...pages];
  const priority=url=>{
    const p=new URL(url).pathname;
    if(p.includes("/products/"))return 0;
    if(p.includes("/collections/"))return 1;
    if(p==="/")return 2;
    if(p.includes("/pages/"))return 3;
    if(p.includes("/blogs/"))return 4;
    return 5;
  };
  all.sort((a,b)=>priority(a)-priority(b)||a.localeCompare(b));
  return all.slice(0,MAX_URLS);
}

function representativeUrls(urls){
  const products=urls.filter(u=>new URL(u).pathname.includes("/products/"));
  const collections=urls.filter(u=>new URL(u).pathname.includes("/collections/"));
  const chosen=[BASE_URL+"/"];
  const patterns=[
    /photo[-_]?frame|frame/i,
    /acrylic/i,
    /mug|cup/i,
    /crystal/i,
    /bottle|sipper/i,
    /shirt|t-shirt/i,
    /pillow/i
  ];
  for(const pattern of patterns){
    const found=products.find(u=>pattern.test(new URL(u).pathname)&&!chosen.includes(u));
    if(found)chosen.push(found);
  }
  for(const u of products){
    if(chosen.length>=8)break;
    if(!chosen.includes(u))chosen.push(u);
  }
  if(collections[0])chosen.push(collections[0]);
  return [...new Set(chosen)].slice(0,9);
}

async function auditPage(page,url,{browserName,viewport,label="crawl",deep=false}){
  const pageErrors=[];
  const consoleErrors=[];
  const onPageError=error=>pageErrors.push(String(error?.message||error));
  const onConsole=msg=>{if(msg.type()==="error")consoleErrors.push(msg.text())};
  page.on("pageerror",onPageError);
  page.on("console",onConsole);
  let response=null;
  let navError=null;
  for(let attempt=1;attempt<=2;attempt+=1){
    try{
      response=await page.goto(url,{waitUntil:"commit",timeout:NAV_TIMEOUT});
      await page.waitForLoadState("domcontentloaded",{timeout:15000}).catch(()=>{});
      await page.waitForLoadState("networkidle",{timeout:2500}).catch(()=>{});
      await sleep(WAIT_AFTER_LOAD);
      navError=null;
      break;
    }catch(error){
      navError=String(error?.message||error);
      if(attempt<2){
        await sleep(800);
        continue;
      }
    }
  }

  const issues=[];
  if(navError)issues.push({severity:"critical",code:"navigation",message:navError.slice(0,260)});
  if(response&&response.status()>=400)issues.push({severity:"critical",code:"http-status",message:`HTTP ${response.status()}`});

  if(!navError){
    const metrics=await page.evaluate(({deep})=>{
      const visible=el=>{
        const r=el.getBoundingClientRect();
        const style=getComputedStyle(el);
        return r.width>0&&r.height>0&&style.display!=="none"&&style.visibility!=="hidden"&&Number(style.opacity||1)>0;
      };
      const vw=document.documentElement.clientWidth;
      const vh=document.documentElement.clientHeight;
      const horizontalOverflow=Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)-vw;
      const startX=window.scrollX;
      const startY=window.scrollY;
      window.scrollTo(99999,startY);
      const horizontalScrollX=window.scrollX;
      window.scrollTo(startX,startY);
      const brokenImages=[...document.images].filter(img=>visible(img)&&img.complete&&img.currentSrc&&img.naturalWidth===0)
        .slice(0,8).map(img=>img.currentSrc);
      const unnamedButtons=[...document.querySelectorAll("button,[role=button]")]
        .filter(visible)
        .filter(el=>!(el.getAttribute("aria-label")||el.getAttribute("title")||el.textContent?.trim()))
        .slice(0,8).map(el=>el.outerHTML.slice(0,140));
      const smallTargets=(deep&&vw<=1024)?[...document.querySelectorAll([
          "button",
          "input:not([type=hidden]):not([type=radio]):not([type=checkbox])",
          "select",
          "summary",
          "[role=button]",
          "a.button",
          "a[class*=button]",
          ".header__icon",
          ".quick-add__submit"
        ].join(","))]
        .filter(visible)
        .filter(el=>!el.closest(".cw-site-sticky-atc"))
        .map(el=>({el,r:el.getBoundingClientRect()}))
        .filter(({r})=>r.width<38||r.height<38)
        .slice(0,12)
        .map(({el,r})=>({label:(el.getAttribute("aria-label")||el.textContent||el.getAttribute("href")||el.tagName).trim().slice(0,70),w:Math.round(r.width),h:Math.round(r.height)})):[];
      const sticky=document.querySelector(".cw-site-sticky-atc");
      const stickyRect=sticky?.getBoundingClientRect();
      const stickyVisible=!!sticky&&visible(sticky);
      const stickyPosition=sticky?getComputedStyle(sticky).position:"";
      const isProduct=location.pathname.includes("/products/");
      const whatsapp=[...document.querySelectorAll('a[href*="wa.me"],a[href*="api.whatsapp.com"],a[href*="whatsapp"],[class*="whatsapp" i]')]
        .filter(visible)
        .map(el=>({el,r:el.getBoundingClientRect()}))
        .filter(({r})=>r.width>=28&&r.height>=28&&r.width<180&&r.height<180);
      let stickyWhatsappOverlap=false;
      if(stickyRect&&stickyVisible){
        stickyWhatsappOverlap=whatsapp.some(({r})=>
          Math.max(0,Math.min(stickyRect.right,r.right)-Math.max(stickyRect.left,r.left))>4&&
          Math.max(0,Math.min(stickyRect.bottom,r.bottom)-Math.max(stickyRect.top,r.top))>4
        );
      }
      return {
        title:document.title,
        horizontalOverflow,
        horizontalScrollX,
        brokenImages,
        unnamedButtons,
        smallTargets,
        isProduct,
        stickyVisible,
        stickyPosition,
        stickyBottom:stickyRect?Math.round(vh-stickyRect.bottom):null,
        stickyWidth:stickyRect?Math.round(stickyRect.width):null,
        stickyWhatsappOverlap,
        bodyText:(document.body?.innerText||"").slice(0,200)
      };
    },{deep});

    if(metrics.horizontalOverflow>6&&metrics.horizontalScrollX>4)issues.push({severity:"critical",code:"horizontal-overflow",message:`Page can scroll ${Math.round(metrics.horizontalScrollX)}px sideways (${Math.round(metrics.horizontalOverflow)}px raw overflow)`});
    // Clipped-only overflow is not user-scrollable, so it is kept out of UX warning counts.
    if(metrics.brokenImages.length)issues.push({severity:"critical",code:"broken-images",message:`${metrics.brokenImages.length} visible broken image(s)`,examples:metrics.brokenImages});
    if(metrics.unnamedButtons.length)issues.push({severity:"warning",code:"unnamed-buttons",message:`${metrics.unnamedButtons.length} visible button(s) have no accessible name`,examples:metrics.unnamedButtons});
    if(metrics.smallTargets.length)issues.push({severity:"warning",code:"small-tap-targets",message:`${metrics.smallTargets.length} small tap target(s) under 38px found`,examples:metrics.smallTargets});
    if(metrics.isProduct&&!metrics.stickyVisible)issues.push({severity:"critical",code:"sticky-atc-missing",message:"Sticky Add to Cart is not visible on this product page"});
    if(metrics.isProduct&&metrics.stickyVisible&&metrics.stickyPosition!=="fixed")issues.push({severity:"critical",code:"sticky-atc-position",message:`Sticky Add to Cart position is ${metrics.stickyPosition}, expected fixed`});
    if(metrics.isProduct&&metrics.stickyVisible&&Math.abs(metrics.stickyBottom||0)>4)issues.push({severity:"warning",code:"sticky-atc-gap",message:`Sticky Add to Cart is ${metrics.stickyBottom}px from viewport bottom`});
    if(metrics.stickyWhatsappOverlap)issues.push({severity:"critical",code:"whatsapp-overlap",message:"WhatsApp button overlaps the sticky Add to Cart bar"});

    if(metrics.isProduct&&metrics.stickyVisible){
      await page.evaluate(()=>window.scrollTo(0,Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)));
      await sleep(120);
      const remains=await page.evaluate(()=>{
        const el=document.querySelector(".cw-site-sticky-atc");
        if(!el)return false;
        const r=el.getBoundingClientRect();
        return getComputedStyle(el).position==="fixed"&&r.bottom>=innerHeight-4&&r.top<innerHeight;
      });
      if(!remains)issues.push({severity:"critical",code:"sticky-atc-scroll",message:"Sticky Add to Cart does not remain visible after scrolling"});
    }
  }

  const actionablePageErrors=pageErrors.filter(message=>
    !/api\/event\/collect.*access control checks/i.test(message)&&
    !/otlp-http-production\.shopifysvc\.com\/v1\/metrics.*access control checks/i.test(message)&&
    !/\.well-known\/shopify\/monorail\/unstable\/produce_batch.*access control checks/i.test(message)
  );
  const hasShopAppCsp=consoleErrors.some(message=>
    /shop\.app.*content security policy/i.test(message)||
    /Framing 'https:\/\/shop\.app\/'/i.test(message)
  );
  const actionableConsoleErrors=consoleErrors.filter(message=>
    !/shop\.app.*content security policy/i.test(message)&&
    !/Framing 'https:\/\/shop\.app\/'/i.test(message)&&
    !(hasShopAppCsp&&/Failed to load resource:.*403/i.test(message))&&
    !/Failed to load resource:.*status of (403|404|502|503|504)/i.test(message)&&
    !/Reached maximum amount of queued data of 64Kb for keepalive requests/i.test(message)&&
    !/X-Content-Type-Options: nosniff/i.test(message)&&
    !/Cookie .* has been rejected for invalid domain/i.test(message)
  );
  if(actionablePageErrors.length)issues.push({severity:"critical",code:"page-errors",message:`${actionablePageErrors.length} uncaught page error(s)`,examples:actionablePageErrors.slice(0,6)});
  if(actionableConsoleErrors.length)issues.push({severity:"warning",code:"console-errors",message:`${actionableConsoleErrors.length} console error(s)`,examples:actionableConsoleErrors.slice(0,6)});

  const critical=issues.some(i=>i.severity==="critical");
  if(critical){
    const shot=path.join(OUTPUT_DIR,"screenshots",`${label}-${browserName}-${viewport.width}x${viewport.height}-${safeName(url)}.png`);
    await page.screenshot({path:shot,fullPage:true}).catch(()=>{});
  }

  const record={url,browser:browserName,viewport,label,issues};
  results.push(record);
  page.removeListener("pageerror",onPageError);
  page.removeListener("console",onConsole);
  return record;
}

async function crawlAll(urls){
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  let next=0;
  const workers=Array.from({length:Math.min(4,urls.length)},async(_,worker)=>{
    const page=await context.newPage();
    page.setDefaultTimeout(12000);
    while(true){
      const index=next++;
      if(index>=urls.length)break;
      const url=urls[index];
      process.stdout.write(`[crawl ${index+1}/${urls.length}] ${url}\n`);
      await auditPage(page,url,{browserName:"chromium",viewport:{width:390,height:844},label:"all-mobile",deep:false});
    }
    await page.close();
  });
  await Promise.all(workers);
  await browser.close();
}

async function responsiveMatrix(urls){
  const viewports=[
    {width:320,height:568,name:"mobile-small"},
    {width:390,height:844,name:"mobile-common"},
    {width:430,height:932,name:"mobile-large"},
    {width:768,height:1024,name:"tablet"},
    {width:1366,height:768,name:"desktop"}
  ];
  const engines=[["chromium",chromium],["webkit",webkit],["firefox",firefox]];

  // Run the three browser engines in parallel. Each engine keeps its own
  // viewport loop sequential so we reduce wall-clock time without creating
  // an excessive number of simultaneous storefront requests.
  await Promise.all(engines.map(async([browserName,type])=>{
    const browser=await type.launch({headless:true});
    try{
      for(const vp of viewports){
        const context=await browser.newContext({viewport:{width:vp.width,height:vp.height}});
        const page=await context.newPage();
        page.setDefaultTimeout(10000);
        for(const url of urls){
          process.stdout.write(`[matrix ${browserName} ${vp.name}] ${url}\n`);
          await auditPage(page,url,{browserName,viewport:{width:vp.width,height:vp.height},label:vp.name,deep:true});
        }
        await context.close();
      }
    }finally{
      await browser.close();
    }
  }));
}

const PHOTO_FIXTURE_BASE64="iVBORw0KGgoAAAANSUhEUgAAAMgAAAEsCAIAAAAJmGvpAAAE8klEQVR4nO3csW1bSRRAUXrhfNvYIhy5JgUuYQPVtJGLcBlyBxsQIGRYEiSZV5w3/5xYJN9g7p9PfAH89PDwcIJr++vWA7AnYZEQFglhkRAWCWGREBYJYZEQFglhkRAWCWGREBYJYZEQFglhkRAWCWGREBaJz3/y4q93P641B2v67/6f973QiUVCWCSERUJYJIRFQlgkhEXij55jPefdDz+4las/knRikRAWCWGREBYJYZEQFglhkRAWCWGREBYJYZEQFglhkRAWCWGREBYJYZEQFglhkRAWCWGREBYJYZEQFglhkRAWCWGREBYJYZEQFglhkUh+H2sPf3+/e82f/fxyX08ykbB+8cqYnnuJyC6EdTq9q6eX30dhhw7rWj298M6HLeygYXVJPflBB8zrcGF9WFK/f+ih8jrW44abVLXIp3+wo5xYi2zqcY6uQ5xYi1R1sdo8hf3DWnMX15zqina+FS6+eXvfFrc9sRav6mLKnG+1Z1izdmvWtK+0YVgT92nizC/bMCxWsFtYcy/9uZM/aauwpu/N9Pkf2yesPXZlj1WcdgqLpWwS1jYX+mmXtewQ1h478dgGK9ohLBY0PqwNLu4nTV/X+LBY0+ywpl/WLxu9utlhsSxhkRgc1ug7xSvNXePgsFiZsEhMDWvuPeKthq50algsTlgkhEViZFhDv3a828T1jgyL9QmLhLBICIuEsEgIi4SwSAiLhLBICIuEsEgIi8TIsHb9QdjnTFzvyLBYn7BICIvE1LAmfu14n6ErnRoWixMWicFhDb1HvMncNQ4Oi5UJi8TssObeKV5j9Opmh8Wyxoc1+rJ+wfR1jQ+LNe0Q1vSL+3cbrGiHsE5b7MTFHmvZJCxWs09Ye1zoe6zitFNYp/m7Mn3+x7YK6zR5b+ZO/qTdwmIRG4Y18dKfOPPLNgzrNG2fZk37SnuGdZqzW1PmfKvPtx4gdN6zZX8ZdtekzrY9sS7W3L81p7qi/cM6rbeLq81T2PlW+Ngit8UjJHV2iBPr4rb7epyqTsc5sS5ucnQdKqmzw4V19mF5HTCps4OGdXbZ9asXdtieLg4d1sW1CtPThbB+8biMV0YmpicJ61mK+RPHetzAhxEWCWGREBYJYZEQFglhkRAWiQ0fkN59//fWI7zH/Zdvtx7hmpxYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRFQlgkhEVCWCSERUJYJIRF4vOtB7i++y/fbj0CTiwawiIhLBLCIiEsEsIiISwSwiIhLBLCIiEsEsn/Cr/e/SjelkGcWCSERUJYJIRFQlgkhEVCWCQ+PTw83HoGNuTEIiEsEsIiISwSwiIhLBLCIiEsEsIiISwSwiIhLBLCIiEsEsIiISwSwiIhLBL/A2a5t6g0uYznAAAAAElFTkSuQmCC";

async function photoFrameJourney(){
  const url=BASE_URL+"/products/customized-photo-frame-black-beading";
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  const issues=[];
  try{
    let opened=false;
    let lastNavigationError=null;
    for(let attempt=1;attempt<=2;attempt+=1){
      try{
        await page.goto(url,{waitUntil:"commit",timeout:NAV_TIMEOUT});
        await page.waitForLoadState("domcontentloaded",{timeout:15000}).catch(()=>{});
        await page.waitForLoadState("networkidle",{timeout:2500}).catch(()=>{});
        opened=true;
        break;
      }catch(error){
        lastNavigationError=error;
        if(attempt<2)await sleep(800);
      }
    }
    if(!opened)throw lastNavigationError||new Error("Photo-frame page navigation failed");
    await sleep(650);

    const radio=page.locator('input[type="radio"][value="24x36"]').first();
    const select=page.locator('select option[value="24x36"]').first();
    if(await radio.count()){
      await radio.evaluate(el=>{
        el.checked=true;
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.dispatchEvent(new Event("change",{bubbles:true}));
      });
    }else if(await select.count()){
      await select.evaluate(option=>{const s=option.parentElement;s.value=option.value;s.dispatchEvent(new Event("change",{bubbles:true}))});
    }else{
      const text=page.getByText("24x36",{exact:true}).last();
      if(await text.count())await text.click({force:true});
      else issues.push({severity:"critical",code:"frame-size-option",message:"24x36 size option was not found"});
    }
    await sleep(700);

    const open=page.locator('[data-cw-personalizer][data-cw-photo-frame-master="true"] [data-cw-open]').first();
    if(!(await open.count()))throw new Error("Customize button not found on master photo frame");
    await open.click({force:true});
    const file=page.locator('[data-cw-personalizer][data-cw-photo-frame-master="true"] input[type="file"]').first();
    if(!(await file.count()))throw new Error("Photo upload input not found");
    await file.setInputFiles({name:"cartwala-qa-photo.png",mimeType:"image/png",buffer:Buffer.from(PHOTO_FIXTURE_BASE64,"base64")});
    await page.waitForFunction(()=>{const b=document.querySelector('[data-cw-personalizer][data-cw-photo-frame-master="true"] [data-cw-save]');return b&&!b.disabled},{timeout:12000});
    await page.locator('[data-cw-personalizer][data-cw-photo-frame-master="true"] [data-cw-save]').click({force:true});
    await page.waitForFunction(()=>document.body.classList.contains("cw-photo-frame-personalized"),{timeout:15000});
    await sleep(1200);

    const sticky=await page.locator(".cw-site-sticky-atc").isVisible().catch(()=>false);
    if(!sticky)issues.push({severity:"critical",code:"frame-sticky-atc",message:"Sticky Add to Cart is not visible after personalization"});

    const visibleKind=await page.evaluate(()=>{
      const candidates=[...document.querySelectorAll("img[data-cw-frame-kind]")].map(img=>({img,r:img.getBoundingClientRect()}))
        .filter(({r,img})=>r.width>120&&r.height>120&&getComputedStyle(img).visibility!=="hidden");
      candidates.sort((a,b)=>b.r.width*b.r.height-a.r.width*a.r.height);
      return candidates[0]?.img.dataset.cwFrameKind||"";
    });
    if(visibleKind!=="size:24x36")issues.push({severity:"critical",code:"frame-size-preview",message:`After selecting 24x36, visible gallery preview is "${visibleKind||"unknown"}"`});

    const guideImage=page.locator(
      '.product-gallery__thumbs img[data-cw-frame-kind="guide"], .product__media-wrapper img[data-cw-frame-kind="guide"], media-gallery img[data-cw-frame-kind="guide"], [id^="MediaGallery-"] img[data-cw-frame-kind="guide"]'
    ).filter({visible:true}).first();
    const fallbackGuide=page.locator('img[data-cw-frame-kind="guide"]').first();
    const guideTarget=(await guideImage.count())?guideImage:fallbackGuide;
    if(await guideTarget.count()){
      const clickable=guideTarget.locator("xpath=ancestor::button[1] | ancestor::a[1] | ancestor::*[@role='button'][1]");
      if(await clickable.count())await clickable.click({force:true});
      else await guideTarget.click({force:true});
      await sleep(900);
      const guideVisible=await page.evaluate(()=>{
        const gallery=document.querySelector(".product-gallery, media-gallery, [id^='MediaGallery-'], .product__media-wrapper")||document;
        const preferred=gallery.querySelector(".product-gallery__main img[data-cw-frame-kind], .product__media-item.is-active img[data-cw-frame-kind], .product__media-item[aria-hidden='false'] img[data-cw-frame-kind]");
        if(preferred)return preferred.dataset.cwFrameKind||"";
        const candidates=[...gallery.querySelectorAll("img[data-cw-frame-kind]")].map(img=>({img,r:img.getBoundingClientRect()}))
          .filter(({r,img})=>r.width>120&&r.height>120&&getComputedStyle(img).visibility!=="hidden"&&getComputedStyle(img).display!=="none");
        candidates.sort((a,b)=>b.r.width*b.r.height-a.r.width*a.r.height);
        return candidates[0]?.img.dataset.cwFrameKind||"";
      });
      if(guideVisible!=="guide")issues.push({severity:"critical",code:"frame-second-image",message:`Clicking size-guide thumbnail opened "${guideVisible||"unknown"}" instead of the second image`});
    }else{
      issues.push({severity:"critical",code:"frame-guide-thumb",message:"Size-guide thumbnail was not found"});
    }

    await page.screenshot({path:path.join(OUTPUT_DIR,"screenshots","photo-frame-personalization-journey.png"),fullPage:true});
  }catch(error){
    issues.push({severity:"critical",code:"frame-journey-error",message:String(error?.message||error).slice(0,320)});
    await page.screenshot({path:path.join(OUTPUT_DIR,"screenshots","photo-frame-personalization-failure.png"),fullPage:true}).catch(()=>{});
  }
  results.push({url,browser:"chromium",viewport:{width:390,height:844},label:"photo-frame-journey",issues});
  await browser.close();
}

async function writeReport(discovered,representative){
  const issueRows=results.flatMap(r=>r.issues.map(i=>({...i,url:r.url,browser:r.browser,viewport:r.viewport,label:r.label})));
  const critical=issueRows.filter(i=>i.severity==="critical");
  const warnings=issueRows.filter(i=>i.severity==="warning");
  const byCode={};
  for(const issue of issueRows)byCode[issue.code]=(byCode[issue.code]||0)+1;
  const report={
    baseUrl:BASE_URL,
    startedAt,
    finishedAt:new Date().toISOString(),
    discoveredUrls:discovered.length,
    representativeUrls:representative,
    checks:results.length,
    criticalCount:critical.length,
    warningCount:warnings.length,
    issueCounts:byCode,
    results
  };
  await fs.writeFile(path.join(OUTPUT_DIR,"report.json"),JSON.stringify(report,null,2));

  const lines=[
    "# Cartwala Website UI/UX QA",
    "",
    `- Base URL: ${BASE_URL}`,
    `- URLs discovered/audited in full-site mobile crawl: **${discovered.length}**`,
    `- Total browser/viewport checks: **${results.length}**`,
    `- Critical issues: **${critical.length}**`,
    `- Warnings: **${warnings.length}**`,
    "",
    "## Coverage",
    "",
    "- Full-site crawl: Chromium at 390×844 across sitemap URLs",
    "- Responsive matrix: Chromium + WebKit (Safari engine) + Firefox",
    "- Viewports: 320×568, 390×844, 430×932, 768×1024, 1366×768",
    "- Product checks: horizontal overflow, broken images, sticky Add to Cart, scroll persistence, WhatsApp overlap",
    "- UX checks: small tap targets, unnamed buttons, console/page errors",
    "- Functional smoke test: master Photo Frame 24×36 → upload → Preview & Save → second image",
    "",
    "## Issue summary",
    ""
  ];
  const sorted=Object.entries(byCode).sort((a,b)=>b[1]-a[1]);
  if(!sorted.length)lines.push("No issues detected in this run.");
  else for(const [code,count] of sorted)lines.push(`- ${code}: **${count}**`);

  lines.push("","## Critical examples","");
  if(!critical.length)lines.push("None.");
  else critical.slice(0,40).forEach(i=>lines.push(`- **${i.code}** — ${new URL(i.url).pathname} — ${i.browser} ${i.viewport.width}×${i.viewport.height}: ${i.message}`));
  lines.push("","## Representative routes","");
  representative.forEach(u=>lines.push(`- ${new URL(u).pathname}`));
  await fs.writeFile(path.join(OUTPUT_DIR,"summary.md"),lines.join("\n")+"\n");
  return {critical,warnings,report};
}

async function main(){
  await ensureOutput();
  const urls=await discoverUrls();
  const reps=representativeUrls(urls);
  console.log(`Discovered ${urls.length} URLs; responsive matrix will cover ${reps.length} representative routes.`);
  await crawlAll(urls);
  await responsiveMatrix(reps);
  await photoFrameJourney();
  const {critical,warnings}=await writeReport(urls,reps);
  console.log(`QA complete: ${critical.length} critical, ${warnings.length} warnings.`);
  if(STRICT&&critical.length)process.exitCode=1;
}

main().catch(async error=>{
  console.error(error);
  await fs.mkdir(OUTPUT_DIR,{recursive:true}).catch(()=>{});
  await fs.writeFile(path.join(OUTPUT_DIR,"fatal.txt"),String(error?.stack||error)).catch(()=>{});
  process.exitCode=1;
});
