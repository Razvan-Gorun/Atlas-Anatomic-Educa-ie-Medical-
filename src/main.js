import * as THREE from 'three';
import { createScene } from './modules/scene.js';
import { loadAnatomy } from './modules/loader.js';
import { InteractionManagerExtended } from './modules/interaction_extended.js';

const canvas = document.getElementById('canvas3d');
const { renderer, scene, camera, controls } = createScene(canvas);

const statusEl = document.getElementById('loadingStatus');
const meshCountEl = document.getElementById('statusMeshCount');

let systemGroups = {};
let config = {};
let allMeshes = [];

window.systemGroups = systemGroups;
window.allMeshes = allMeshes;
window.controls = controls;

// ---------- STAREA GRUPULUI CURENT ----------
let currentGroupData = null;      // obiectul JSON al grupului activ
let activeLayers = new Set();     // setul de chei ale straturilor active

// ---------- FUNCȚII ORIGINALE ----------
function toggleSystem(system) {
  const sys = systemGroups[system];
  if (sys) {
    sys.visible = !sys.visible;
    sys.meshes.forEach(mesh => mesh.visible = sys.visible);
    document.querySelectorAll('.filter-btn').forEach(btn => {
      if (btn.dataset.system === system) btn.classList.toggle('active', sys.visible);
    });
  }
}
window.toggleSystem = toggleSystem;

function createToggleButtons() {
  const container = document.querySelector('.test-controls');
  if (!container) return;
  container.innerHTML = '';
  for (const [sys, cfg] of Object.entries(config.systems)) {
    if (sys === 'other') continue;
    const btn = document.createElement('button');
    btn.className = `test-btn ${sys}`;
    btn.textContent = cfg.name;
    btn.dataset.system = sys;
    const group = systemGroups[sys];
    if (group && group.visible) btn.classList.add('active');
    btn.onclick = () => {
      toggleSystem(sys);
      btn.classList.toggle('active');
    };
    container.appendChild(btn);
  }
}

function resetView() {
  camera.position.set(4, 3, 8);
  controls.target.set(0, 1.2, 0);
  controls.update();
  if (window.interactionManager) window.interactionManager.exitFocusMode();
}
window.resetView = resetView;

// ---------- APLICARE FILTRU GRUP ----------
function applyGroupFilter() {
  if (!currentGroupData) return;

  const { base, layers } = currentGroupData;

  // 1. Ascundem tot
  allMeshes.forEach(m => m.visible = false);
  Object.values(systemGroups).forEach(g => g.visible = false);

  // 2. Construim setul de ID-uri care vor fi afișate
  const allowedIds = new Set(base);
  for (const layerKey of activeLayers) {
    if (layers[layerKey] && layers[layerKey].ids) {
      layers[layerKey].ids.forEach(id => allowedIds.add(id));
    }
  }

  // 3. Afișăm doar mesh-urile al căror ID normalizat se află în set
  allMeshes.forEach(m => {
    const struct = m.userData.structure;
    if (struct && allowedIds.has(struct.id)) {
      m.visible = true;
      const sys = struct.system;
      if (systemGroups[sys]) systemGroups[sys].visible = true;
    }
  });
}

// ---------- ÎNCĂRCARE GRUP ----------
async function loadGroup(groupId) {
  try {
    const resp = await fetch(`./data/groups/${groupId}.json`);
    if (!resp.ok) throw new Error('Grupul nu există');
    const groupData = await resp.json();
    currentGroupData = groupData;
    activeLayers.clear();

    // Construim interfața de straturi
    const layersContainer = document.getElementById('groupLayers');
    layersContainer.innerHTML = '';

    for (const [key, layer] of Object.entries(groupData.layers)) {
      const label = document.createElement('label');
      label.className = 'layer-checkbox';
      label.innerHTML = `<input type="checkbox" data-layer="${key}"> <span>${layer.icon || ''} ${layer.label}</span>`;
      layersContainer.appendChild(label);

      const checkbox = label.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          activeLayers.add(key);
          label.classList.add('active');
        } else {
          activeLayers.delete(key);
          label.classList.remove('active');
        }
        applyGroupFilter();
      });
    }

    document.getElementById('groupTitle').textContent = groupData.icon + ' ' + groupData.name;
    document.getElementById('groupPanel').classList.remove('hidden');
    applyGroupFilter();

  } catch (err) {
    console.warn('Eroare la încărcarea grupului:', err);
    currentGroupData = null;
    document.getElementById('groupPanel').classList.add('hidden');
    // Revenim la vizibilitatea normală (toate)
    Object.values(systemGroups).forEach(g => {
      g.visible = true;
      g.meshes.forEach(m => m.visible = true);
    });
  }
}

// ---------- IEȘIRE DIN GRUP (revenire la starea inițială) ----------
function resetGroup() {
  // Ieșim din modul de grup
  currentGroupData = null;
  activeLayers.clear();
  
  // Ascundem panoul de grup
  document.getElementById('groupPanel').classList.add('hidden');
  
  // Restabilim starea inițială (doar scheletul)
  Object.entries(systemGroups).forEach(([key, group]) => {
    group.visible = (key === 'skeletal');
    group.meshes.forEach(m => m.visible = group.visible);
  });
  
  // Actualizăm butoanele toggle
  document.querySelectorAll('.test-btn').forEach(btn => {
    const sys = btn.dataset.system;
    if (sys && systemGroups[sys]) {
      btn.classList.toggle('active', systemGroups[sys].visible);
    }
  });
}

// ---------- INIȚIALIZARE DUPĂ ÎNCĂRCARE ----------
loadAnatomy(
  scene,
  (pct) => { if (statusEl) statusEl.textContent = `⏳ Se încarcă modelul... ${pct}%`; },
  ({ systemGroups: groups, config: cfg, meshes }) => {
    systemGroups = groups;
    config = cfg;
    allMeshes = meshes;
    window.systemGroups = systemGroups;
    window.allMeshes = allMeshes;

    if (statusEl) statusEl.textContent = '✅ Model încărcat';
    if (meshCountEl) meshCountEl.textContent = `${allMeshes.length} mesh-uri`;

    // Pornim doar cu scheletul vizibil
    Object.entries(systemGroups).forEach(([key, group]) => {
      group.visible = (key === 'skeletal');
      group.meshes.forEach(m => m.visible = group.visible);
    });

    createToggleButtons();

    const interactionManager = new InteractionManagerExtended(canvas, camera, scene, systemGroups, config);
    window.interactionManager = interactionManager;
    window.resetHidden = () => interactionManager.resetHiddenMeshes();
    window.getDescriptionTemplate = () => interactionManager.getDescriptionTemplate();

    document.getElementById('btnHighlight').addEventListener('click', () => {
      if (interactionManager && interactionManager.highlightedMesh)
        interactionManager.focusOnStructure(interactionManager.highlightedMesh);
    });

    const resetBtn = document.getElementById('resetView');
    if (resetBtn) resetBtn.addEventListener('click', resetView);

    // ────────── TOOLBAR ──────────
    const toggleRotate = document.getElementById('toggleRotate');
    const toggleTransparency = document.getElementById('toggleTransparency');
    const toggleLabels = document.getElementById('toggleLabels');

    if (toggleRotate) {
      toggleRotate.addEventListener('click', () => {
        controls.autoRotate = !controls.autoRotate;
        toggleRotate.classList.toggle('active', controls.autoRotate);
      });
    }
    if (toggleTransparency) {
      let transparencyEnabled = false;
      toggleTransparency.addEventListener('click', () => {
        transparencyEnabled = !transparencyEnabled;
        toggleTransparency.classList.toggle('active', transparencyEnabled);
        allMeshes.forEach(m => {
          if (m.material) {
            m.material.transparent = transparencyEnabled;
            m.material.opacity = transparencyEnabled ? 0.4 : 1.0;
            m.material.depthWrite = !transparencyEnabled;
            m.material.needsUpdate = true;
          }
        });
      });
    }
    if (toggleLabels) {
      let labelsVisible = false;
      toggleLabels.addEventListener('click', () => {
        labelsVisible = !labelsVisible;
        toggleLabels.classList.toggle('active', labelsVisible);
      });
    }

    // ────────── CĂUTARE ──────────
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    if (searchInput && searchResults) {
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        if (query.length < 2) { searchResults.classList.add('hidden'); return; }
        const matching = allMeshes.filter(m => {
          const name = (m.userData.structure?.name || m.name).toLowerCase();
          return name.includes(query);
        }).slice(0, 10);
        searchResults.innerHTML = matching.length
          ? matching.map(m => {
              const struct = m.userData.structure;
              const name = struct?.name || m.name || '?';
              const sys = struct?.system || m.userData.system || 'other';
              const color = config.systems[sys]?.color || '#888';
              return `<div class="search-item" data-uuid="${m.uuid}">
                <span class="search-item-dot" style="background-color:${color}"></span>
                <span class="search-item-name">${name}</span>
                <span class="search-item-sys">${sys}</span>
              </div>`;
            }).join('')
          : '<div class="search-item" style="color: var(--text-muted);">Niciun rezultat</div>';
        searchResults.classList.remove('hidden');
      });
      document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target))
          searchResults.classList.add('hidden');
      });
      searchResults.addEventListener('click', (e) => {
        const item = e.target.closest('.search-item');
        if (!item) return;
        const uuid = item.dataset.uuid;
        const mesh = allMeshes.find(m => m.uuid === uuid);
        if (!mesh) return;
        const sys = mesh.userData.system;
        if (sys && systemGroups[sys] && !systemGroups[sys].visible) {
          systemGroups[sys].visible = true;
          systemGroups[sys].meshes.forEach(m => m.visible = true);
        }
        if (interactionManager && interactionManager.focusOnStructure) {
          interactionManager.highlightedMesh = mesh;
          interactionManager.setMeshEmissive(mesh, interactionManager.highlightColor, 0.8);
          interactionManager.showStructureInfo(mesh.userData.structure || null);
          interactionManager.focusOnStructure(mesh);
        } else {
          interactionManager.centerCameraOnMesh(mesh);
        }
        searchInput.value = '';
        searchResults.innerHTML = '';
        searchResults.classList.add('hidden');
      });
    }

    // ────────── DROPDOWN GRUP RESPIRATOR ──────────
    const respBtn = document.getElementById('btnRespiratory');
    const groupPanel = document.getElementById('groupPanel');

    if (respBtn && groupPanel) {
      respBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        groupPanel.classList.toggle('hidden');
        // Dacă se deschide dropdown-ul, încarcă grupul dacă nu e deja încărcat
        if (!groupPanel.classList.contains('hidden') && !currentGroupData) {
          loadGroup('respiratory');
        }
      });

      // Închide dropdown-ul la clic în afara lui
      document.addEventListener('click', (e) => {
        if (!groupPanel.classList.contains('hidden') &&
            !groupPanel.contains(e.target) &&
            e.target !== respBtn) {
          groupPanel.classList.add('hidden');
        }
      });
    }

    // Butonul de ieșire din grup
    document.getElementById('groupReset').addEventListener('click', () => {
      resetGroup();
      document.getElementById('groupPanel').classList.add('hidden');
    });

    // ────────── ANIMAȚIE ──────────
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
  }
);