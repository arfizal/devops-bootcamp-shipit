import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function createScene(container, params) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 1.1, 6);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.append(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(3, 5, 4);
  scene.add(key);

  // Start with the procedural rocket (instant, always works); upgrade to the
  // vendored model if it loads.
  let rocket = buildProceduralRocket(params.color);
  scene.add(rocket);

  new GLTFLoader().load(
    import.meta.env.BASE_URL + 'rocket.glb',
    (gltf) => {
      const model = gltf.scene;
      tint(model, params.color);
      fitToHeight(model, 2.4);
      scene.remove(rocket);
      disposeObject3D(rocket);
      rocket = model;
      scene.add(rocket);
    },
    undefined,
    (err) => {
      // Graceful degradation, but not silent — keep the procedural rocket and log why.
      console.warn('rocket.glb failed to load — using the procedural rocket', err);
    },
  );

  let raf = 0;
  const clock = new THREE.Clock();
  function tick() {
    const t = clock.getElapsedTime();
    rocket.rotation.y = t * 0.5;
    rocket.position.y = Math.sin(t * 1.5) * 0.15;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();

  function onResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener('resize', onResize);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      disposeObject3D(rocket);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function tint(object3d, color) {
  const c = new THREE.Color(color);
  object3d.traverse((node) => {
    if (node.isMesh && node.material) {
      node.material = node.material.clone();
      node.material.color = c;
    }
  });
}

function fitToHeight(object3d, targetHeight) {
  const box = new THREE.Box3().setFromObject(object3d);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const scale = size.y > 0 ? targetHeight / size.y : 1;
  object3d.scale.setScalar(scale);
  object3d.position.sub(center.multiplyScalar(scale));
}

function disposeObject3D(obj) {
  obj.traverse((node) => {
    if (node.isMesh) {
      node.geometry?.dispose();
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) m?.dispose();
    }
  });
}

function buildProceduralRocket(color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), metalness: 0.3, roughness: 0.4 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1f2933, metalness: 0.2, roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 24), bodyMat);
  group.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 24), bodyMat);
  nose.position.y = 1.45;
  group.add(nose);

  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.5), trimMat);
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.5, -0.9, Math.sin(a) * 0.5);
    fin.lookAt(0, -0.9, 0);
    group.add(fin);
  }
  return group;
}
