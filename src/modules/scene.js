import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createScene(canvas) {
  // Renderer cu anti-aliasing și spațiu de culoare corect
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.sortObjects = true;
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setClearColor(0x0e1524); // fundal medical
  renderer.outputColorSpace = THREE.SRGBColorSpace; // corecție culoare modernă

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    45,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000
  );
  camera.position.set(4, 3, 8);
  camera.lookAt(0, 1, 0);

  // ⚡ Iluminare clinică echilibrată
  const ambient = new THREE.AmbientLight(0x405080, 1.1);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xfff5eb, 1.4);
  key.position.set(3, 6, 4);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xb0d0ff, 0.7);
  fill.position.set(-3, 2, -2);
  scene.add(fill);

  const back = new THREE.DirectionalLight(0x557799, 0.5);
  back.position.set(0, -1, -5);
  scene.add(back);

  // Grid opțional
  const grid = new THREE.GridHelper(20, 20, 0x335577, 0x112233);
  grid.position.y = -1.5;
  scene.add(grid);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 1.2, 0);
  controls.update();

  window.addEventListener('resize', () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
  });

  return { renderer, scene, camera, controls };
}