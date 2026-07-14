import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SHIPS, hueShiftFor } from './ship-schema.js';

export function createScene(container, params, { onError } = {}) {
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

  const spinner = document.createElement('div');
  spinner.className = 'loader';
  spinner.style.setProperty('--ship-color', params.color);
  container.append(spinner);

  const ship = SHIPS.find((s) => s.id === params.shipModel) || SHIPS[0];
  const hue = hueShiftFor(params.color, ship.baseHue);

  let rocket = null;
  let disposed = false;
  let raf = 0;
  const clock = new THREE.Clock();

  function onResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener('resize', onResize);

  function tick() {
    const t = clock.getElapsedTime();
    if (rocket) {
      rocket.rotation.y = t * 0.5;
      rocket.position.y = Math.sin(t * 1.5) * 0.15;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();

  function teardown() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    spinner.remove();
    if (rocket) disposeObject3D(rocket);
    renderer.dispose();
    renderer.domElement.remove();
  }

  // The load is async; the scene may be disposed before it resolves. Guard both
  // callbacks so a late load neither touches a torn-down scene nor leaks the GPU
  // resources it just allocated.
  new GLTFLoader().load(
    import.meta.env.BASE_URL + ship.file,
    (gltf) => {
      spinner.remove();
      if (disposed) {
        disposeObject3D(gltf.scene);
        return;
      }
      rocket = gltf.scene;
      applyHueShift(rocket, hue);
      fitByMaxDimension(rocket, 2.8);
      scene.add(rocket);
    },
    undefined,
    (err) => {
      if (disposed) return;
      console.warn(`${ship.file} failed to load`, err);
      teardown();
      onError?.(err);
    },
  );

  return { dispose: teardown };
}

// Rotate the hue of every mesh material in the model by `radians`, in-shader,
// after the base-colour texture is sampled. Low-saturation texels (black
// cockpit, grey trim) barely move; saturated paint rotates to the target hue.
function applyHueShift(object3d, radians) {
  if (!radians) return;
  object3d.traverse((node) => {
    if (node.isMesh && node.material) {
      node.material = node.material.clone();
      node.material.onBeforeCompile = (shader) => {
        shader.uniforms.uHue = { value: radians };
        shader.fragmentShader =
          'uniform float uHue;\n' +
          shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
             {
               float a = uHue;
               mat3 m = mat3(0.299,0.587,0.114, 0.299,0.587,0.114, 0.299,0.587,0.114)
                 + cos(a)*mat3(0.701,-0.587,-0.114, -0.299,0.413,-0.114, -0.299,-0.587,0.886)
                 + sin(a)*mat3(0.168,0.330,-0.497, -0.328,0.035,0.292, 1.250,-1.050,-0.203);
               diffuseColor.rgb = clamp(m * diffuseColor.rgb, 0.0, 1.0);
             }`,
          );
      };
      node.material.needsUpdate = true;
    }
  });
}

function fitByMaxDimension(object3d, target) {
  const box = new THREE.Box3().setFromObject(object3d);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const max = Math.max(size.x, size.y, size.z);
  const scale = max > 0 ? target / max : 1;
  object3d.scale.setScalar(scale);
  object3d.position.sub(center.multiplyScalar(scale));
}

function disposeObject3D(obj) {
  obj.traverse((node) => {
    if (node.isMesh) {
      node.geometry?.dispose();
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) disposeMaterial(m);
    }
  });
}

function disposeMaterial(material) {
  if (!material) return;
  // A material owns its textures (map, normalMap, roughnessMap, …); dispose them
  // too, or the GPU handles leak. Walk its properties rather than naming each map.
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose();
}
