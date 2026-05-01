import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function toDisplayName(meshName) {
  let side = '';
  let clean = meshName;

  const sideMatch = meshName.match(/(_l|_r)$/i);
  if (sideMatch) {
    side = sideMatch[1].toLowerCase() === '_l' ? ' (stâng)' : ' (drept)';
    clean = meshName.replace(/_l$|_r$/i, '');
  } else {
    const numMatch = meshName.match(/(_1|_2)$/);
    if (numMatch) {
      side = numMatch[1] === '_1' ? ' (stâng)' : ' (drept)';
      clean = meshName.replace(/(_1|_2)$/, '');
    }
  }

  const human = clean
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();

  return human + side;
}

async function loadWhitelist(system) {
  const nameMap = {
    skeletal: 'boneWhitelist.json',
    muscular: 'muscleWhitelist.json',
    nervous: 'nervousWhitelist.json',
    arterial: 'arterialWhitelist.json',
    venous: 'venousWhitelist.json',
    visceral: 'visceralWhitelist.json',
    joints: 'jointWhitelist.json',
    integumentary: 'integumentaryWhitelist.json',
  };
  const filename = nameMap[system];
  if (!filename) return new Set();
  try {
    const resp = await fetch(`./data/${filename}`);
    if (!resp.ok) {
      console.warn(`Whitelist ${filename} nu a fost găsit (${resp.status})`);
      return new Set();
    }
    const raw = await resp.json();
    return new Set(raw.map(normalize));
  } catch (e) {
    console.warn(`Eroare la încărcarea ${filename}`, e);
    return new Set();
  }
}

function getAnatomicalColor(meshName, system) {
  const name = meshName.toLowerCase();

  if (system === 'skeletal') {
    if (name.includes('tooth') || name.includes('molar') || name.includes('canine') || name.includes('incisor'))
      return 0xf5ebd8;
    return 0xe6d2b5;
  }

  if (system === 'muscular') {
    if (name.includes('tendon') || name.includes('aponeurosis')) return 0xfaf0e0;
    return 0xb84c3b;
  }

  if (system === 'nervous') {
    if (name.includes('gyrus') || name.includes('sulcus') || name.includes('cortex'))
      return 0xd5c0a5;
    if (name.includes('white_matter') || name.includes('tract')) return 0xf5f0e6;
    return 0xe6b422;
  }

  if (system === 'arterial') return 0xd64541;
  if (system === 'venous') return 0x3b7bb7;

  if (system === 'visceral') {
    if (name.includes('liver')) return 0x8b3e3e;
    if (name.includes('pleura')) return 0x9ec0e0;
    if (name.includes('lung')) return 0xc89696;
    if (name.includes('heart') || name.includes('atrium') || name.includes('ventricle')) return 0xb83a2e;
    if (name.includes('stomach')) return 0xd2996b;
    if (name.includes('kidney')) return 0xc49a6c;
    if (name.includes('spleen')) return 0x8b4789;
    if (name.includes('pancreas')) return 0xe6c4a0;
    if (name.includes('bladder')) return 0xd4b38a;
    if (name.includes('tongue')) return 0xd15b5b;
    if (name.includes('thyroid')) return 0xc95a5a;
    if (name.includes('trachea') || name.includes('bronch')) return 0xc89696;
    return 0xd35400;
  }

  if (system === 'joints') {
    if (name.includes('cartilage')) return 0xd4dce6;
    if (name.includes('ligament')) return 0xe6d98a;
    return 0xbbc3c7;
  }

  if (system === 'integumentary') return 0xf3cba7;

  return 0x95a5a6;
}

export async function loadAnatomy(scene, onProgress, onReady) {
  const configResp = await fetch('./data/config.json');
  const config = await configResp.json();

  const nameToSystem = new Map();
  for (const sys of Object.keys(config.systems)) {
    if (sys === 'other') continue;
    const whitelist = await loadWhitelist(sys);
    for (const name of whitelist) {
      nameToSystem.set(name, sys);
    }
  }

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
  loader.setDRACOLoader(draco);

  loader.load(
    config.model.path,
    (gltf) => {
      const root = gltf.scene;

      if (config.model.center) {
        const bbox = new THREE.Box3().setFromObject(root);
        root.position.sub(bbox.getCenter(new THREE.Vector3()));
      }
      if (config.model.scale !== 1.0) {
        root.scale.setScalar(config.model.scale);
      }

      const meshes = [];

      root.traverse(child => {
        if (!child.isMesh) return;
        meshes.push(child);

        const normalized = normalize(child.name);
        const sys = nameToSystem.get(normalized) || 'other';
        child.userData.system = sys;

        child.userData.structure = {
          id: normalized,
          name: toDisplayName(child.name),
          system: sys
        };

        const isPleura = child.name.toLowerCase().includes('pleura');
        const color = getAnatomicalColor(child.name, sys);
        const roughness = isPleura ? 0.5 : 0.72;
        const opacity = isPleura ? 0.45 : 1.0;
        const transparent = isPleura;

        child.material = new THREE.MeshStandardMaterial({
          color,
          roughness,
          metalness: 0.02,
          transparent,
          opacity,
          depthTest: true,
          depthWrite: !transparent,
        });
      });

      // ████████████████████████████████████████████████████████
      // 🔧 PLEURA – POZIȚIONARE ȘI SCALARE DIRECTĂ (5.9)
      // ████████████████████████████████████████████████████████
      const lungMeshes = meshes.filter(m => m.name.toLowerCase().includes('lung'));
      const pleuraMesh = meshes.find(m => m.name.toLowerCase().includes('pleura'));

      if (lungMeshes.length && pleuraMesh) {
        const lungBox = new THREE.Box3();
        lungMeshes.forEach(m => lungBox.expandByObject(m));
        const center = lungBox.getCenter(new THREE.Vector3());

        pleuraMesh.position.copy(center);
        pleuraMesh.scale.set(5.9, 5.9, 5.9);
      }

      scene.add(root);

      const systemGroups = {};
      for (const sys of Object.keys(config.systems)) {
        systemGroups[sys] = {
          visible: config.systems[sys].visibleByDefault,
          meshes: meshes.filter(m => m.userData.system === sys)
        };
      }

      meshes.forEach(m => {
        const sys = m.userData.system;
        if (systemGroups[sys]) {
          m.visible = systemGroups[sys].visible;
        }
      });

      if (window.controls) {
        const bbox = new THREE.Box3().setFromObject(root);
        const sphere = new THREE.Sphere();
        bbox.getBoundingSphere(sphere);
        window.controls.target.copy(sphere.center);
      }

      console.log('✅ Model încărcat. Sisteme:',
        Object.entries(systemGroups).map(([k, v]) => `${k}: ${v.meshes.length}`).join(', ')
      );

      onReady({ systemGroups, config, meshes });
    },
    (xhr) => {
      if (xhr.lengthComputable) {
        onProgress(Math.round((xhr.loaded / xhr.total) * 100));
      }
    },
    (error) => console.error('Eroare la încărcarea modelului:', error)
  );
}