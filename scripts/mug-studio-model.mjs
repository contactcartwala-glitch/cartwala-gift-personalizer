import * as THREE from 'three';

export function createWhiteMug(kind = "white") {
  const model = new THREE.Group();
  model.name = 'Cartwala_11oz_white_mug';
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.19, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.09, ior: 1.48 });
  ceramic.name = 'Ceramic';
  const profile = [
    [0,-1.135],[0.72,-1.135],[0.77,-1.145],[0.785,-1.185],
    [0.81,-1.2],[0.9,-1.2],[0.95,-1.188],[0.98,-1.16],[0.996,-1.12],
    [1,-1.06],[1,1.15],[0.996,1.176],[0.985,1.193],[0.963,1.2],
    [0.942,1.195],[0.925,1.181],[0.918,1.16],[0.918,-0.93],
    [0.91,-0.975],[0.89,-1.007],[0.85,-1.029],[0.79,-1.04],[0,-1.04],
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile.slice(0,14).map(p=>new THREE.Vector2(...p)),192), ceramic);
  const innerMaterial = ceramic.clone(); innerMaterial.name = 'Inner';
  const inner = new THREE.Mesh(new THREE.LatheGeometry(profile.slice(13).map(p=>new THREE.Vector2(...p)),192), innerMaterial);
  inner.name = 'Ceramic_inner'; model.add(inner);
  body.name = 'Ceramic_body_rim_and_base';
  model.add(body);
  const path = new THREE.CurvePath();
  const points = kind === 'love-handle' ? [
    [[0.94,0.7,0],[1.18,0.8,0],[1.25,0.73,0],[1.34,0.53,0]],
    [[1.34,0.53,0],[1.38,0.44,0],[1.39,0.44,0],[1.48,0.5,0]],
    [[1.48,0.5,0],[1.88,0.77,0],[2.08,0.25,0],[1.78,-0.1,0]],
    [[1.78,-0.1,0],[1.54,-0.38,0],[1.2,-0.61,0],[0.94,-0.61,0]],
  ] : [
    [[0.958,0.77,0],[1.24,0.79,0],[1.66,0.79,0],[1.72,0.4,0]],
    [[1.72,0.4,0],[1.79,0.14,0],[1.77,-0.2,0],[1.67,-0.43,0]],
    [[1.67,-0.43,0],[1.53,-0.73,0],[1.21,-0.77,0],[0.958,-0.75,0]],
  ];
  for(const p of points) path.add(new THREE.CubicBezierCurve3(...p.map(v=>new THREE.Vector3(...v))));
  const handle = new THREE.Mesh(new THREE.TubeGeometry(path,96,0.125,20,false),ceramic.clone());
  handle.name = kind === 'love-handle' ? 'Heart_handle' : 'Smooth_D_handle';
  handle.material.name = 'Handle';
  model.add(handle);
  const printMaterial = ceramic.clone();
  printMaterial.name = 'Print';
  const print = new THREE.Mesh(new THREE.CylinderGeometry(1.0015,1.0015,2.24,160,1,true,Math.PI/2+0.44,Math.PI*2-0.88),printMaterial);
  print.name = 'Wrap_print_keep_handle_clear';
  const printUv = print.geometry.attributes.uv;
  for(let i=0;i<printUv.count;i++) printUv.setY(i,1-printUv.getY(i));
  model.add(print);
  return model;
}

export function softwareGeometry(model) {
  const vertices = [], indices = [];
  model.updateMatrixWorld(true);
  model.traverse(mesh=>{
    if(!mesh.isMesh) return;
    const g = mesh.geometry;
    const offset = vertices.length/9;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for(let i=0;i<g.attributes.position.count;i++) {
      p.fromBufferAttribute(g.attributes.position,i).applyMatrix4(mesh.matrixWorld);
      n.fromBufferAttribute(g.attributes.normal,i).applyMatrix3(normalMatrix).normalize();
      const printed = mesh.material.name === 'Print';
      const u = g.attributes.uv?.getX(i) || 0;
      const v = printed ? 1-g.attributes.uv.getY(i) : 0;
      vertices.push(...p.toArray(),...n.toArray(),0.925-u*0.85,0.018+v*0.964,printed?0:mesh.name.includes('handle')?2:mesh.material.name==='Inner'?1:4);
    }
    const count=g.index?.count||g.attributes.position.count;
    for(let i=0;i<count;i++) indices.push(offset+(g.index?g.index.getX(i):i));
  });
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
