import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createWhiteMug, softwareGeometry } from './mug-studio-model.mjs';

export async function createViewer(host, options) {
  const gltf = await new GLTFLoader().loadAsync(options.modelUrl);
  const model = options.mugModel && options.mugModel !== 'white' ? createWhiteMug(options.mugModel) : gltf.scene;
  let mugState={handleColour:options.mugModel==='magic'?'#171717':options.mugModel==='red'?'#d92f3f':'#ffffff',innerColour:options.mugModel==='red'?'#d92f3f':'#ffffff',heated:false};
  let disposed=false, active=false, frame=0, lastTime=0, imageVersion=0, texture=null, image=null, spinning=true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  spinning=!reduced.matches;
  const camera=new THREE.PerspectiveCamera(32,1,0.05,80);
  const scene=new THREE.Scene();
  scene.background=new THREE.Color('#15181d');
  scene.add(model);
  let renderer, software, environment;
  try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'}); }
  catch { software=options.software(softwareGeometry(model)); }
  if(!renderer && !software) throw new Error('3D graphics are unavailable in this browser.');
  const canvas=renderer?.domElement||software.canvas;
  canvas.className='cw-mug-preview__canvas';
  canvas.setAttribute('aria-hidden','true');
  if(renderer) {
    host.append(canvas);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.15;
    const studio=new THREE.Scene();
    studio.background=new THREE.Color(0x64676c);
    for(const [position,scale,intensity] of [
      [[-3,2.5,4],[1.3,6,1],5], [[4,1,2],[0.75,5,1],3], [[0,5,-1],[4,1,3],3], [[-1,0,-5],[2,4,1],1.8],
    ]) {
      const panel=new THREE.Mesh(new THREE.BoxGeometry(...scale),new THREE.MeshBasicMaterial({color:new THREE.Color().setScalar(intensity)}));
      panel.position.set(...position);
      panel.lookAt(0,0,0);
      studio.add(panel);
    }
    const pmrem=new THREE.PMREMGenerator(renderer);
    environment=pmrem.fromScene(studio,0.035);
    scene.environment=environment.texture;
    scene.environmentIntensity=0.85;
    pmrem.dispose();
    studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
    scene.add(new THREE.HemisphereLight(0xffffff,0x61666e,1.35));
    const key=new THREE.DirectionalLight(0xffffff,2);
    key.position.set(-3,5,5);scene.add(key);
  }
  const controls=new OrbitControls(camera,canvas);
  controls.target.set(0.24,0,0);
  controls.enablePan=false;
  controls.enableDamping=true;
  controls.dampingFactor=0.075;
  controls.rotateSpeed=0.7;
  controls.zoomSpeed=0.8;
  controls.minPolarAngle=0.015;
  controls.maxPolarAngle=Math.PI-0.015;
  controls.autoRotateSpeed=2.2;
  controls.autoRotate=spinning;
  controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
  let baseDistance=6, interacting=false;
  const start=()=>{interacting=true;host.dataset.cwMotion='dragging';};
  const end=()=>{interacting=false;host.dataset.cwMotion=spinning?'rotating':'paused';};
  controls.addEventListener('start',start);
  controls.addEventListener('end',end);
  const originalMaterials=new Set();
  model.traverse(mesh=>{if(mesh.isMesh){originalMaterials.add(mesh.material);mesh.material.envMapIntensity=0.9;}});
  const printMeshes=[];
  model.traverse(mesh=>{if(mesh.isMesh && mesh.material.name==='Print')printMeshes.push(mesh);});
  const render=()=>{
    if(disposed) return;
    camera.updateMatrixWorld();
    if(renderer) renderer.render(scene,camera);
    else {
      const r=new THREE.Matrix3().setFromMatrix4(camera.matrixWorldInverse).elements;
      const distance=camera.position.distanceTo(controls.target);
      const heightAtTarget=2*distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      const center=controls.target.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(camera.matrixWorldInverse));
      software.render({studio:true,rotationMatrix:r,studioFrame:{center:[center.x,center.y],scale:2/heightAtTarget},zoom:1,...mugState},image);
    }
  };
  const animate=time=>{
    frame=0;
    if(!active||disposed||document.hidden) {lastTime=0;return;}
    const delta=lastTime?Math.min((time-lastTime)/1000,0.1):0;
    if(software && lastTime && time-lastTime<50) {frame=requestAnimationFrame(animate);return;}
    lastTime=time;
    controls.update(delta);
    render();
    frame=requestAnimationFrame(animate);
  };
  const startLoop=()=>{if(active&&!disposed&&!document.hidden&&!frame)frame=requestAnimationFrame(animate);};
  const stopLoop=()=>{cancelAnimationFrame(frame);frame=0;lastTime=0;};
  const visibility=()=>{if(document.hidden)stopLoop();else startLoop();};
  document.addEventListener('visibilitychange',visibility);
  const resize=()=>{
    const {width,height}=host.getBoundingClientRect();
    if(!width||!height||disposed)return;
    camera.aspect=width/height;
    const oldBase=baseDistance;
    baseDistance=Math.max(5.7,5.3/camera.aspect);
    if(camera.position.length())camera.position.sub(controls.target).multiplyScalar(baseDistance/oldBase).add(controls.target);
    controls.minDistance=baseDistance*0.55;
    controls.maxDistance=baseDistance*1.65;
    camera.updateProjectionMatrix();
    renderer?.setSize(width,height,false);
    controls.update(0);render();
  };
  const reset=()=>{
    camera.position.set(0.24+baseDistance*0.35,baseDistance*0.16,baseDistance*0.923);
    controls.target.set(0.24,0,0);
    controls.update(0);
    controls.saveState();
    render();
  };
  reset();resize();
  const observer=new ResizeObserver(resize);observer.observe(host);
  const setZoom=value=>{
    const next=THREE.MathUtils.clamp(value,0.65,1.8);
    camera.position.sub(controls.target).setLength(baseDistance/next).add(controls.target);
    controls.update(0);render();
  };
  const keydown=event=>{
    const amounts={ArrowLeft:-0.15,ArrowRight:0.15,ArrowUp:-0.12,ArrowDown:0.12};
    if(event.key in amounts){
      const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      if(event.key==='ArrowLeft'||event.key==='ArrowRight')spherical.theta+=amounts[event.key];
      else spherical.phi=THREE.MathUtils.clamp(spherical.phi+amounts[event.key],0.015,Math.PI-0.015);
      camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update(0);render();event.preventDefault();
    }else if(['+','=','-','Home'].includes(event.key)){
      event.preventDefault();if(event.key==='Home')reset();else setZoom(baseDistance/camera.position.distanceTo(controls.target)+(event.key==='-'?-0.15:0.15));
    }
  };
  host.parentElement.addEventListener('keydown',keydown);
  const contextLost=event=>{event.preventDefault();stopLoop();host.dataset.cwStudioStatus='context-lost';options.onError?.('3D graphics were interrupted. Close and reopen the preview to retry.');};
  const contextRestored=()=>{host.dataset.cwStudioStatus='ready';options.onReady?.();startLoop();};
  canvas.addEventListener('webglcontextlost',contextLost);
  canvas.addEventListener('webglcontextrestored',contextRestored);
  host.dataset.cwStudioStatus='ready';
  host.dataset.cwStudioRenderer=renderer?'webgl':'software';
  return {
    setState(state){
      mugState={...mugState,...state};
      const cold=options.mugModel==='magic'&&!mugState.heated;
      model.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const material=mesh.material;
        material.color.set(material.name==='Inner'?mugState.innerColour:material.name==='Handle'?mugState.handleColour:cold?'#171717':'#ffffff');
        if(material.name==='Print'){material.map=cold?null:texture;material.needsUpdate=true;}
      });
      render();
    },
    open(){active=true;resize();startLoop();host.dataset.cwMotion=spinning?'rotating':'paused';},
    close(){active=false;stopLoop();host.dataset.cwMotion='closed';},
    reset,
    setZoom,
    getZoom(){return baseDistance/camera.position.distanceTo(controls.target);},
    setSpinning(value){spinning=Boolean(value);controls.autoRotate=spinning;host.dataset.cwMotion=interacting?'dragging':spinning?'rotating':'paused';return spinning;},
    get spinning(){return spinning;},
    async setTexture(url){
      const revision=++imageVersion;
      const next=await new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Your design could not be loaded. Please try again.'));img.src=url;});
      if(disposed||revision!==imageVersion)return;
      const bitmap=document.createElement('canvas');
      const scale=Math.min(1,2048/next.naturalWidth);
      bitmap.width=Math.max(1,Math.round(next.naturalWidth*scale));bitmap.height=Math.max(1,Math.round(next.naturalHeight*scale));
      const context=bitmap.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,bitmap.width,bitmap.height);context.drawImage(next,0,0,bitmap.width,bitmap.height);
      const nextTexture=new THREE.CanvasTexture(bitmap);nextTexture.flipY=false;nextTexture.colorSpace=THREE.SRGBColorSpace;nextTexture.anisotropy=renderer?Math.min(8,renderer.capabilities.getMaxAnisotropy()):1;
      texture?.dispose();texture=nextTexture;image=next;
      for(const mesh of printMeshes){mesh.material.map=options.mugModel==='magic'&&!mugState.heated?null:texture;mesh.material.needsUpdate=true;}
      render();
    },
    dispose(){disposed=true;active=false;imageVersion++;stopLoop();observer.disconnect();document.removeEventListener('visibilitychange',visibility);host.parentElement.removeEventListener('keydown',keydown);controls.dispose();texture?.dispose();model.traverse(o=>o.geometry?.dispose());originalMaterials.forEach(m=>m.dispose());environment?.dispose();renderer?.dispose();canvas.remove();},
  };
}
