import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWhiteMug, softwareGeometry } from './mug-studio-model.mjs';

const bytes=fs.readFileSync('extensions/cartwala-personalizer/assets/cartwala-white-mug.glb');
assert.equal(bytes.toString('utf8',0,4),'glTF');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const model=gltf.scene;
const print=model.getObjectByName('Wrap_print_keep_handle_clear');
assert.ok(print);
const p=print.geometry.attributes.position, uv=print.geometry.attributes.uv;
for(let i=0;i<p.count;i++) {
  assert.ok(uv.getX(i)>=0 && uv.getX(i)<=1);
  assert.ok(Math.abs(uv.getY(i)-(p.getY(i)>0?0:1))<1e-5,'GLB top must map to image top');
  assert.ok(p.getX(i)<0.91,'Print must leave the handle seam blank');
}
const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
assert.ok(Math.abs(size.y-2.4)<0.01);
assert.ok(size.x>2.8&&size.x<3,'Natural handle proportions');
const mesh=softwareGeometry(model);
assert.ok(mesh.vertices.every(Number.isFinite));
assert.ok(mesh.indices.every(i=>i<mesh.vertices.length/9));
let upwardFloor=false,downwardBase=false,inwardWall=false;
for(let i=0;i<mesh.vertices.length;i+=9){
  const [x,y,z,nx,ny,nz]=mesh.vertices.slice(i,i+6);
  assert.ok(Math.abs(Math.hypot(nx,ny,nz)-1)<1e-5);
  if(Math.hypot(x,z)<0.02&&y<0&&ny>0.9)upwardFloor=true;
  if(Math.hypot(x,z)<0.02&&y<0&&ny< -0.9)downwardBase=true;
  if(y>0.8&&nx*x+nz*z< -0.5)inwardWall=true;
  assert.ok(!(y>1.1&&Math.hypot(x,z)<0.90),'Opening must remain hollow');
}
assert.ok(upwardFloor&&downwardBase&&inwardWall);
assert.equal(createWhiteMug().children.length,4);
const turn=fps=>{
  const camera=new THREE.PerspectiveCamera();camera.position.set(0,0,6);
  const controls=new OrbitControls(camera,null);controls.autoRotate=true;controls.autoRotateSpeed=2.2;
  for(let i=0;i<fps*5;i++)controls.update(1/fps);
  const angle=controls.getAzimuthalAngle();
  controls.autoRotate=false;controls.update(1);
  assert.equal(controls.getAzimuthalAngle(),angle,'Pause must stop automatic movement');
  controls.autoRotate=true;controls.update(1);
  assert.notEqual(controls.getAzimuthalAngle(),angle,'Resume must restart automatic movement');
  return angle;
};
assert.ok(Math.abs(turn(30)-turn(120))<1e-10,'Rotation speed must be independent of display refresh rate');
console.log('GLB round trip, hollow cup, handle proportions, print seam/orientation, normalized normals, automatic rotation and pause/resume passed.');

for(const kind of ['white','red','magic','love-handle']) {
  const mug=createWhiteMug(kind), geometry=softwareGeometry(mug);
  assert.ok(geometry.vertices.every(Number.isFinite));
  assert.ok(mug.getObjectByName('Ceramic_inner'));
  assert.ok(mug.children.some(m=>m.material.name==='Handle'));
  if(kind==='love-handle')assert.ok(mug.getObjectByName('Heart_handle'));
}
