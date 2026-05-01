import * as THREE from 'three';

export class InteractionManager {
  constructor(canvas, camera, scene, systemGroups, config) {
    this.canvas = canvas;
    this.camera = camera;
    this.scene = scene;
    this.systemGroups = systemGroups;
    this.config = config;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.highlightedMesh = null;
    this.hoveredMesh = null;
    this.focusedMesh = null;

    // Culori de evidențiere (fără emisie, pentru a preveni artefacte)
    this.highlightColor = new THREE.Color(0x4a90d9);
    this.hoverColor = new THREE.Color(0x7bb5e0);
    this.focusColor = new THREE.Color(0xc0d8f0);

    this.hiddenMeshes = new Set();

    // Elemente panou informativ
    this.panelPlaceholder = document.getElementById('panelPlaceholder');
    this.panelContent = document.getElementById('panelContent');
    this.panelBadge = document.getElementById('panelBadge');
    this.panelName = document.getElementById('panelName');
    this.panelLatin = document.getElementById('panelLatin');
    this.panelDesc = document.getElementById('panelDesc');
    this.panelFunc = document.getElementById('panelFunc');
    this.panelTags = document.getElementById('panelTags');
    this.panelFacts = document.getElementById('panelFacts');
    this.panelFactsWrap = document.getElementById('panelFactsWrap');
    this.hoverLabel = document.getElementById('hoverLabel');

    this.hiddenListContainer = document.getElementById('hiddenPanel');
    this.hiddenListItems = document.getElementById('hiddenItems');
    this.hiddenListCount = document.getElementById('hiddenCount');

    this.initEvents();
    this.updateHiddenListUI();
  }

  // ═══════════ METODĂ SIGURĂ DE EVIDENȚIERE ═══════════
  _applyColorToMesh(mesh, color) {
    if (!mesh) return;
    const apply = (mat) => {
      if (!mat || !mat.isMaterial) return;
      if (!mat._originalColor) mat._originalColor = mat.color.clone();
      mat.color.set(color);
      if (mat.emissive) mat.emissive.set(0x000000);
      mat.emissiveIntensity = 0;
      const structureId = mesh.userData?.structure?.id || '';
      if (structureId.includes('pleura')) {
        mat.transparent = true;
        mat.opacity = 0.35;
        mat.depthWrite = false;
      }
      mat.needsUpdate = true;
    };
    if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
    else apply(mesh.material);
  }

  _restoreMeshColor(mesh) {
    if (!mesh) return;
    const apply = (mat) => {
      if (!mat || !mat.isMaterial) return;
      if (mat._originalColor) {
        mat.color.copy(mat._originalColor);
        const structureId = mesh.userData?.structure?.id || '';
        if (structureId.includes('pleura')) {
          mat.transparent = true;
          mat.opacity = 0.35;
          mat.depthWrite = false;
        } else {
          mat.transparent = false;
          mat.opacity = 1;
          mat.depthWrite = true;
        }
        mat.emissive?.set(0x000000);
        mat.emissiveIntensity = 0;
        mat.needsUpdate = true;
      }
    };
    if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
    else apply(mesh.material);
  }

  setOpacity(mesh, opacity) {
    if (!mesh) return;
    const apply = (mat) => {
      if (!mat) return;
      // Nu modifica transparența dacă este pleura
      const structureId = mesh.userData?.structure?.id || '';
      if (structureId.includes('pleura')) return;
      mat.transparent = opacity < 1.0;
      mat.opacity = opacity;
      mat.depthWrite = opacity >= 1.0;
      mat.needsUpdate = true;
    };
    if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
    else apply(mesh.material);
  }

  getVisibleMeshes() {
    const visible = [];
    Object.values(this.systemGroups).forEach(sys => {
      if (sys.visible) visible.push(...sys.meshes);
    });
    return visible.filter(m => !this.hiddenMeshes.has(m));
  }

  showStructureInfo(structure) {
    if (!this.panelPlaceholder || !this.panelContent) return;
    if (!structure) {
      this.panelPlaceholder.classList.remove('hidden');
      this.panelContent.classList.add('hidden');
      return;
    }
    this.panelPlaceholder.classList.add('hidden');
    this.panelContent.classList.remove('hidden');

    const badgeText = structure.system?.toUpperCase() || '';
    const badgeClass = `panel-system-badge sys-${structure.system || 'other'}`;

    if (this.panelBadge) {
      this.panelBadge.textContent = badgeText;
      this.panelBadge.className = badgeClass;
    }
    if (this.panelName) this.panelName.textContent = structure.name || '';
    if (this.panelLatin) this.panelLatin.textContent = structure.latin || '';
    if (this.panelDesc) this.panelDesc.textContent = structure.description || '';
    if (this.panelFunc) this.panelFunc.textContent = structure.function || '';
    if (this.panelTags) this.panelTags.innerHTML = `<span class="panel-tag">${structure.system || ''}</span>`;
    if (this.panelFactsWrap && this.panelFacts) {
      if (structure.facts?.length) {
        this.panelFactsWrap.classList.remove('hidden');
        this.panelFacts.innerHTML = structure.facts
          .map(f => `<li><span>${f.label}</span><span>${f.value}</span></li>`)
          .join('');
      } else {
        this.panelFactsWrap.classList.add('hidden');
      }
    }
  }

  updateHoverLabel(mesh, clientX, clientY) {
    if (!this.hoverLabel) return;
    if (mesh && mesh.userData.structure) {
      const struct = mesh.userData.structure;
      this.hoverLabel.textContent = struct.name || struct.id;
      this.hoverLabel.style.display = 'block';
      this.hoverLabel.style.left = (clientX + 15) + 'px';
      this.hoverLabel.style.top = (clientY - 10) + 'px';
    } else {
      this.hoverLabel.style.display = 'none';
    }
  }

  hideMesh(mesh) {
    if (!mesh) return;
    mesh.visible = false;
    this.hiddenMeshes.add(mesh);

    if (this.highlightedMesh === mesh) {
      this._restoreMeshColor(mesh);
      this.highlightedMesh = null;
      this.showStructureInfo(null);
    }
    if (this.hoveredMesh === mesh) {
      this._restoreMeshColor(mesh);
      this.hoveredMesh = null;
      this.updateHoverLabel(null);
    }
    this.updateHiddenListUI();
  }

  unhideMesh(mesh) {
    if (!mesh) return;
    mesh.visible = true;
    this.hiddenMeshes.delete(mesh);
    this.updateHiddenListUI();
  }

  resetHiddenMeshes() {
    this.hiddenMeshes.forEach(m => { m.visible = true; });
    this.hiddenMeshes.clear();
    this.updateHiddenListUI();
  }

  updateHiddenListUI() {
    if (!this.hiddenListContainer || !this.hiddenListItems || !this.hiddenListCount) return;
    const hiddenArray = Array.from(this.hiddenMeshes);
    const count = hiddenArray.length;
    this.hiddenListCount.textContent = count;

    if (count === 0) {
      this.hiddenListItems.innerHTML = '<li class="hidden-list-empty">Nicio structură ascunsă</li>';
      return;
    }

    hiddenArray.sort((a, b) => {
      const nameA = a.userData.structure?.name || a.name;
      const nameB = b.userData.structure?.name || b.name;
      return nameA.localeCompare(nameB);
    });

    this.hiddenListItems.innerHTML = hiddenArray.map(mesh => {
      const struct = mesh.userData.structure;
      const displayName = struct?.name || mesh.name;
      const system = struct?.system || mesh.userData.system || 'other';
      return `
        <li class="hidden-list-item">
          <span class="hidden-item-name" style="color: ${this.config.systems[system]?.color || '#888'}">${displayName}</span>
          <button class="hidden-item-show" data-mesh-id="${mesh.uuid}" title="Arată structura">👁</button>
        </li>
      `;
    }).join('');

    this.hiddenListItems.querySelectorAll('.hidden-item-show').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uuid = btn.dataset.meshId;
        const mesh = hiddenArray.find(m => m.uuid === uuid);
        if (mesh) this.unhideMesh(mesh);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  FOCUS MODE (complet funcțional, fără emisie)
  // ═══════════════════════════════════════════════════════════
  centerCameraOnMesh(mesh, duration = 800) {
    if (!window.controls || !this.camera) return;
    
    const worldPos = mesh.getWorldPosition(new THREE.Vector3());
    const startTarget = window.controls.target.clone();
    const startCamPos = this.camera.position.clone();
    
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    let distance;
    if (maxDim < 0.5) {
      distance = maxDim * 4.0 + 0.6;
    } else if (maxDim < 2.0) {
      distance = maxDim * 3.0 + 1.0;
    } else {
      distance = maxDim * 2.5 + 1.5;
    }
    
    const direction = new THREE.Vector3(0.1, 0.2, 1).normalize();
    const endCamPos = worldPos.clone().addScaledVector(direction, distance);
    const endTarget = worldPos.clone();
    
    const startTime = performance.now();
    
    const animateCamera = (currentTime) => {
      const elapsed = currentTime - startTime;
      const t = Math.min(elapsed / duration, 1.0);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      
      this.camera.position.lerpVectors(startCamPos, endCamPos, eased);
      window.controls.target.lerpVectors(startTarget, endTarget, eased);
      window.controls.update();
      
      if (t < 1.0) {
        requestAnimationFrame(animateCamera);
      }
    };
    
    requestAnimationFrame(animateCamera);
  }

  applyFocusHighlight(mesh) {
    this._applyColorToMesh(mesh, this.focusColor);
  }

  clearFocusHighlight(mesh) {
    if (!mesh) return;
    this._restoreMeshColor(mesh);
  }

  restoreGroupOpacity(system) {
    const group = this.systemGroups[system];
    if (!group) return;
    group.meshes.forEach(m => {
      const structureId = m.userData?.structure?.id || '';
      if (structureId.includes('pleura')) return;
      this.setOpacity(m, 1.0);
    });
  }

  findStructureById(system, id) {
    const group = this.systemGroups[system];
    if (!group) return null;
    const mesh = group.meshes.find(m => m.userData.structure?.id === id);
    return mesh?.userData.structure || null;
  }

  updateRelationsPanel(structureId, system) {
    let relationsContainer = document.getElementById('relationsContainer');
    if (!relationsContainer) {
      relationsContainer = document.createElement('div');
      relationsContainer.id = 'relationsContainer';
      relationsContainer.className = 'panel-section';
      relationsContainer.innerHTML = '<h3>🔗 Relații anatomice</h3><div id="relationsList"></div>';
      this.panelContent.appendChild(relationsContainer);
    }
    
    const relationsList = document.getElementById('relationsList');
    relationsList.innerHTML = '';
    
    const relations = window.anatomyRelations?.[system]?.[structureId];
    if (!relations) {
      relationsContainer.classList.add('hidden');
      return;
    }
    
    relationsContainer.classList.remove('hidden');
    
    for (const [sys, ids] of Object.entries(relations)) {
      const sysName = this.config.systems[sys]?.name || sys;
      const sysColor = this.config.systems[sys]?.color || '#888';
      
      const section = document.createElement('div');
      section.className = 'relations-system';
      section.innerHTML = `
        <div class="relations-header">
          <span class="relations-dot" style="background-color: ${sysColor}"></span>
          <span class="relations-system-name">${sysName} (${ids.length})</span>
          <button class="relations-toggle-btn" data-system="${sys}">👁</button>
        </div>
        <ul class="relations-list">
          ${ids.map(id => {
            const struct = this.findStructureById(sys, id);
            const name = struct?.name || id;
            return `<li>${name}</li>`;
          }).join('')}
        </ul>
      `;
      relationsList.appendChild(section);
    }
    
    relationsList.querySelectorAll('.relations-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sys = btn.dataset.system;
        if (this.systemGroups[sys]) {
          const isVisible = this.systemGroups[sys].visible;
          this.systemGroups[sys].visible = !isVisible;
          this.systemGroups[sys].meshes.forEach(m => m.visible = !isVisible);
          btn.textContent = isVisible ? '👁‍🗨' : '👁';
        }
      });
    });
  }

  focusOnStructure(mesh) {
    if (this.focusedMesh === mesh) {
      this.exitFocusMode();
      return;
    }
    this.exitFocusMode();
    if (!mesh) return;

    this.centerCameraOnMesh(mesh);
    
    this.applyFocusHighlight(mesh);
    this.focusedMesh = mesh;

    const system = mesh.userData.system;
    const group = this.systemGroups[system];
    if (group) {
      group.meshes.forEach(m => {
        if (m !== mesh && m.visible) {
          this.setOpacity(m, 0.25);
        }
      });
    }

    const structureId = mesh.userData.structure?.id;
    if (structureId && window.anatomyRelations && window.anatomyRelations[system]) {
      const relations = window.anatomyRelations[system][structureId];
      if (relations) {
        for (const [sys, ids] of Object.entries(relations)) {
          const sysGroup = this.systemGroups[sys];
          if (!sysGroup) continue;
          ids.forEach(relatedId => {
            const relatedMesh = sysGroup.meshes.find(m => m.userData.structure?.id === relatedId);
            if (relatedMesh && relatedMesh.visible) {
              this._applyColorToMesh(relatedMesh, new THREE.Color(0x888888));
            }
          });
        }
      }
    }
    
    this.updateRelationsPanel(structureId, system);
  }

  exitFocusMode() {
    if (!this.focusedMesh) return;
    
    const relationsContainer = document.getElementById('relationsContainer');
    if (relationsContainer) {
      relationsContainer.classList.add('hidden');
    }
    
    this.clearFocusHighlight(this.focusedMesh);
    const system = this.focusedMesh.userData.system;
    this.restoreGroupOpacity(system);

    const structureId = this.focusedMesh.userData.structure?.id;
    if (structureId && window.anatomyRelations && window.anatomyRelations[system]) {
      const relations = window.anatomyRelations[system][structureId];
      if (relations) {
        for (const [sys, ids] of Object.entries(relations)) {
          const sysGroup = this.systemGroups[sys];
          if (!sysGroup) continue;
          ids.forEach(relatedId => {
            const relatedMesh = sysGroup.meshes.find(m => m.userData.structure?.id === relatedId);
            if (relatedMesh) {
              this._restoreMeshColor(relatedMesh);
            }
          });
        }
      }
    }
    this.focusedMesh = null;
  }

  // ═══════════════════════════════════════════════════════════
  //  EVENIMENTE
  // ═══════════════════════════════════════════════════════════
  initEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const visibleMeshes = this.getVisibleMeshes();
      const intersects = this.raycaster.intersectObjects(visibleMeshes);
      const hit = intersects.length > 0 ? intersects[0].object : null;

      if (this.hoveredMesh && this.hoveredMesh !== this.highlightedMesh) {
        this._restoreMeshColor(this.hoveredMesh);
      }
      if (hit) {
        this.canvas.style.cursor = 'pointer';
        this.hoveredMesh = hit;
        this.updateHoverLabel(hit, e.clientX, e.clientY);
        if (hit !== this.highlightedMesh) {
          this._applyColorToMesh(hit, this.hoverColor);
        }
      } else {
        this.canvas.style.cursor = 'default';
        this.hoveredMesh = null;
        this.updateHoverLabel(null);
      }
    });

    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const visibleMeshes = this.getVisibleMeshes();
      const intersects = this.raycaster.intersectObjects(visibleMeshes);
      const hit = intersects.length > 0 ? intersects[0].object : null;

      if (e.altKey && hit) {
        this.hideMesh(hit);
        return;
      }
      if (this.highlightedMesh) {
        this._restoreMeshColor(this.highlightedMesh);
        this.highlightedMesh = null;
      }
      if (hit) {
        this.highlightedMesh = hit;
        this._applyColorToMesh(hit, this.highlightColor);
        this.showStructureInfo(hit.userData.structure || null);
      } else {
        this.showStructureInfo(null);
      }
    });
  }
}