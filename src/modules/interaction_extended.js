import { InteractionManager } from './interaction.js';
import * as THREE from 'three';

export class InteractionManagerExtended extends InteractionManager {

  // ─────────- inițializare extra (opțional) ─────────
  constructor(...args) {
    super(...args);
    this._initDirectionButtons();      // ← inițializăm butoanele direcționale
    this.detailNote = null;           // ← notița plutitoare
    this.descriptionsCache = {};      // ← cache pentru descrieri
  }

  // ✅ MODIFICARE IMPORTANTĂ: supraîncărcarea metodei care alege mesh‑urile vizibile
  // Acum ține cont de vizibilitatea INDIVIDUALĂ a fiecărui mesh (folosită de grupurile anatomice)
  getVisibleMeshes() {
    // Pornim de la toate mesh‑urile din toate sistemele
    const all = Object.values(this.systemGroups).flatMap(sys => sys.meshes);
    // Păstrăm doar cele care sunt efectiv vizibile și nu au fost ascunse manual
    return all.filter(m => m.visible === true && !this.hiddenMeshes.has(m));
  }

  // Apelăm automat relațiile dinamice după ce se afișează informațiile
  showStructureInfo(structure) {
    super.showStructureInfo(structure);
    
    // Conectăm butonul "Descriere detaliată"
    const btn = document.getElementById('btnDescription');
    if (btn) {
      if (structure && this.highlightedMesh) {
        btn.style.display = 'inline-block';
        btn.onclick = () => this.openDetailedDescription(structure);
      } else {
        btn.style.display = 'none';
      }
    }

    // Dacă notița e deschisă și se selectează altceva, o închidem
    if (this.detailNote) {
      this.closeDetailNote();
    }

    if (structure && this.highlightedMesh) {
      this.showDynamicRelations(this.highlightedMesh);
    }
  }

  // ═══════════════════════════════════════════════
  // 📖 NOU: Notiță detaliată plutitoare
  // ═══════════════════════════════════════════════
  async openDetailedDescription(structure) {
    const system = structure.system;
    if (!system) return;

    const normalizedId = this._normalizeAnatomyId(structure.id);

    let descriptions = this.descriptionsCache[system];
    if (!descriptions) {
      try {
        const resp = await fetch(`./data/descriptions/${system}.json`);
        if (!resp.ok) {
          console.warn(`Fișierul ${system}.json lipsește`);
          return;
        }
        descriptions = await resp.json();
        this.descriptionsCache[system] = descriptions;
      } catch (e) {
        console.warn('Eroare la încărcarea descrierilor', e);
        return;
      }
    }

    const info = descriptions[normalizedId];
    if (!info) {
      alert('Nu există descriere detaliată pentru această structură.');
      return;
    }

    if (this.detailNote) this.closeDetailNote();

    const note = document.createElement('div');
    note.className = 'floating-desc-note';
    note.innerHTML = `
      <div class="note-header">
        <span>📖 ${structure.name}</span>
        <button class="note-close">✖</button>
      </div>
      <div class="note-body">
        <h3>${structure.name}</h3>
        <div class="latin">${structure.latin || ''}</div>
        <p><strong>Descriere:</strong> ${info.description || ''}</p>
        <p><strong>Funcție:</strong> ${info.function || ''}</p>
        ${info.facts && info.facts.length ? `
          <ul class="facts">
            ${info.facts.map(f => `<li><span>${f.label}</span><span>${f.value}</span></li>`).join('')}
          </ul>
        ` : ''}
      </div>
    `;

    const rect = this.canvas.getBoundingClientRect();
    note.style.left = (rect.right - 400) + 'px';
    note.style.top = (rect.top + 50) + 'px';

    document.body.appendChild(note);
    note.style.display = 'flex';

    // Mecanism drag & drop
    const header = note.querySelector('.note-header');
    let drag = false, startX, startY, initialLeft, initialTop;

    header.addEventListener('mousedown', (e) => {
      drag = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = note.offsetLeft;
      initialTop = note.offsetTop;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      note.style.left = (initialLeft + e.clientX - startX) + 'px';
      note.style.top = (initialTop + e.clientY - startY) + 'px';
    });

    window.addEventListener('mouseup', () => { drag = false; });

    note.querySelector('.note-close').onclick = () => this.closeDetailNote();

    this.detailNote = note;
  }

  closeDetailNote() {
    if (this.detailNote) {
      this.detailNote.remove();
      this.detailNote = null;
    }
  }

  // ═══════════════════════════════════════════════
  // 🧪 Metodă ajutătoare pentru șablon (în consolă)
  // ═══════════════════════════════════════════════
  getDescriptionTemplate() {
    if (!this.highlightedMesh) {
      console.warn('Nicio structură selectată. Click pe un obiect 3D mai întâi.');
      return;
    }
    const struct = this.highlightedMesh.userData.structure;
    const system = this.highlightedMesh.userData.system;
    if (!struct || !system) {
      console.warn('Structura nu are date suficiente.');
      return;
    }
    const normalizedId = this._normalizeAnatomyId(struct.id);
    const template = {
      [normalizedId]: {
        description: "",
        function: "",
        facts: []
      }
    };
    console.log(`Șablon pentru ${struct.name} (sistem: ${system})`);
    console.log(JSON.stringify(template, null, 2));
    return template;
  }

  // ═══════════════════════════════════════
  // 🔍 CENTRARE CAMERĂ ÎMBUNĂTĂȚITĂ (acceptă direcție forțată)
  // ═══════════════════════════════════════
  centerCameraOnMesh(mesh, duration = 800, forcedDirection = null) {
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
    
    let direction = new THREE.Vector3();
    
    if (forcedDirection) {
      switch (forcedDirection) {
        case 'front':  direction.set(0, 0, 1); break;
        case 'back':   direction.set(0, 0, -1); break;
        case 'left':   direction.set(-1, 0, 0); break;
        case 'right':  direction.set(1, 0, 0); break;
        default:       direction.set(0, 0, 1);   break;
      }
      direction.y += 0.35;
      direction.normalize();
    } else {
      const absX = Math.abs(worldPos.x);
      const absZ = Math.abs(worldPos.z);
      
      if (absX > absZ) {
        if (worldPos.x > 0) {
          direction.set(1, 0, 0);
        } else {
          direction.set(-1, 0, 0);
        }
      } else {
        if (worldPos.z > 0.3) {
          direction.set(0, 0, 1);
        } else if (worldPos.z < -0.3) {
          direction.set(0, 0, -1);
        } else {
          direction.set(0, 0, -1);
        }
      }
      direction.y += 0.35;
      direction.normalize();
    }
    
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

  // ═══════════════════════════════════════════════
  // Metodă apelată de butoanele direcționale
  // ═══════════════════════════════════════════════
  focusOnStructureFromDirection(mesh, direction) {
    if (!mesh) return;
    if (this.highlightedMesh !== mesh) {
      if (this.highlightedMesh) {
        this.resetMeshEmissive(this.highlightedMesh);
      }
      this.highlightedMesh = mesh;
      this.setMeshEmissive(mesh, this.highlightColor, 0.8);
      this.showStructureInfo(mesh.userData.structure || null);
    }
    if (this.focusedMesh) {
      this.exitFocusMode();
    }
    this.applyFocusHighlight(mesh);
    this.focusedMesh = mesh;
    const system = mesh.userData.system;
    this.restoreGroupOpacity(system);
    const group = this.systemGroups[system];
    if (group) {
      group.meshes.forEach(m => {
        if (m !== mesh && m.visible) {
          this.setOpacity(m, 0.25);
        }
      });
    }
    this.centerCameraOnMesh(mesh, 800, direction);
    this.showDynamicRelations(mesh);
  }

  // ═══════════════════════════════════════
  // Inițializare butoane direcționale
  // ═══════════════════════════════════════
  _initDirectionButtons() {
    const ready = () => {
      const btns = document.querySelectorAll('.dir-btn');
      if (btns.length > 0) {
        btns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            const dir = btn.dataset.dir;
            if (this.highlightedMesh) {
              this.focusOnStructureFromDirection(this.highlightedMesh, dir);
            }
          });
        });
      }
    };
    if (document.readyState === 'complete') {
      ready();
    } else {
      window.addEventListener('load', ready);
    }
  }

  // ═══════════════════════════════════════
  // 🔗 Relații anatomice dinamice (neschimbate)
  // ═══════════════════════════════════════
  _normalizeAnatomyId(id) {
    return id
      .replace(/(_musclee[0-9]*[lr])$/i, '')
      .replace(/(_muscleo[0-9]*[lr])$/i, '')
      .replace(/(_[0-9]*[lr])$/i, '')
      .replace(/(_o[0-9]*[lr])$/i, '')
      .replace(/(_e[0-9]*[lr])$/i, '')
      .replace(/_1$/i, '')
      .replace(/_2$/i, '')
      .toLowerCase();
  }

  getNearbyStructures(mesh, maxDist = 0.05, maxPerSystem = 15) {
    const allMeshes = window.allMeshes || [];
    const result = {};
    if (!mesh) return result;

    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) / 2;

    const candidates = [];

    allMeshes.forEach(other => {
      if (other === mesh) return;
      const sys = other.userData.system;
      if (!sys || sys === 'other' || !other.visible) return;

      const otherBox = new THREE.Box3().setFromObject(other);
      const otherCenter = otherBox.getCenter(new THREE.Vector3());
      const otherSize = otherBox.getSize(new THREE.Vector3());
      const otherRadius = Math.max(otherSize.x, otherSize.y, otherSize.z) / 2;

      const dist = Math.max(0, center.distanceTo(otherCenter) - radius - otherRadius);

      if (dist <= maxDist) {
        candidates.push({ sys, dist, other });
      }
    });

    candidates.sort((a, b) => a.dist - b.dist);

    const countPerSystem = {};
    candidates.forEach(({ sys, other }) => {
      if (!countPerSystem[sys]) countPerSystem[sys] = 0;
      if (countPerSystem[sys] >= maxPerSystem) return;

      const structId = other.userData.structure?.id;
      if (!structId) return;
      const name = this._normalizeAnatomyId(structId);
      if (!result[sys]) result[sys] = [];
      if (!result[sys].includes(name)) {
        result[sys].push(name);
        countPerSystem[sys]++;
      }
    });

    return result;
  }

  getActiveFilterSystems() {
    const activeBtn = document.querySelector('.filter-btn.active');
    if (!activeBtn) return Object.keys(this.config.systems);
    const system = activeBtn.dataset.system;
    if (system === 'all') return Object.keys(this.config.systems);
    return [system];
  }

  showDynamicRelations(mesh) {
    let container = document.getElementById('relationsContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'relationsContainer';
      container.className = 'panel-section';
      container.innerHTML = '<h3>🔗 Relații anatomice</h3><div id="relationsList"></div>';
      this.panelContent.appendChild(container);
    }

    const list = document.getElementById('relationsList');
    list.innerHTML = '';

    if (!mesh) {
      container.classList.add('hidden');
      return;
    }

    const nearby = this.getNearbyStructures(mesh, 0.01, 12);
    const activeSystems = this.getActiveFilterSystems();

    let hasAny = false;
    for (const [sys, ids] of Object.entries(nearby)) {
      if (!activeSystems.includes(sys)) continue;
      if (ids.length === 0) continue;

      hasAny = true;
      const sysName = this.config.systems[sys]?.name || sys;
      const sysColor = this.config.systems[sys]?.color || '#888';

      const section = document.createElement('div');
      section.className = 'relations-system';
      section.innerHTML = `
        <div class="relations-header">
          <span class="relations-dot" style="background-color: ${sysColor}"></span>
          <span class="relations-system-name">${sysName} (${ids.length})</span>
        </div>
        <ul class="relations-list">
          ${ids.map(id => {
            const struct = this.findStructureById(sys, id);
            const name = struct?.name || id;
            return `<li>${name}</li>`;
          }).join('')}
        </ul>
      `;
      list.appendChild(section);
    }

    container.classList.toggle('hidden', !hasAny);
  }
}