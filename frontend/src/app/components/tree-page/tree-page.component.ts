import { Component, OnInit, ChangeDetectorRef, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { GraphService } from '../../services/graph.service';
import { ThemeService } from '../../services/theme.service';
import { GraphData } from '../../models/relation.model';
import { Person, PersonCreate, PersonPhoto } from '../../models/person.model';
import { TreeComponent } from '../tree/tree.component';
import { PersonPanelComponent } from '../person-panel/person-panel.component';
import { PersonFormComponent, PersonFormRelation } from '../person-form/person-form.component';
import { RelationFormComponent } from '../relation-form/relation-form.component';
import { LegendComponent } from '../legend/legend.component';

@Component({
  selector: 'app-tree-page',
  standalone: true,
  imports: [CommonModule, TreeComponent, PersonPanelComponent, PersonFormComponent, RelationFormComponent, LegendComponent],
  template: `
    <div class="page">
      <header class="toolbar">
        <div class="toolbar-left">
          <button class="btn-back" (click)="router.navigate(['/'])">← Назад</button>
          <span class="title">{{ focusedPerson?.first_name }} {{ focusedPerson?.last_name }}</span>
        </div>
        <div class="actions">
          <button class="btn-export" (click)="exportPng()" title="Експортирай като PNG">⬇ PNG</button>
          <button class="btn-theme" (click)="theme.toggle()" [title]="theme.isDark ? 'Светла тема' : 'Тъмна тема'">{{ theme.isDark ? '☀️' : '🌙' }}</button>
          <button class="btn-secondary" (click)="showRelationForm = true">+ Връзка</button>
          <button class="btn-primary" (click)="openAddForm()">+ Човек</button>
        </div>
      </header>

      <div class="content-wrap">
        <main class="canvas-wrap">
          @if (filteredGraph && filteredGraph.nodes.length) {
            <app-tree
              [graphData]="filteredGraph"
              [focusedId]="focusedId"
              [selectedId]="selectedPerson?.id ?? null"
              (nodeClicked)="onNodeClick($event)"
            ></app-tree>
          } @else {
            <div class="empty">Зареждане...</div>
          }
          
          <div class="zoom-controls">
            <button class="btn-zoom" (click)="treeComponent?.zoomIn()" title="Увеличаване">+</button>
            <button class="btn-zoom" (click)="treeComponent?.zoomOut()" title="Намаляване">−</button>
            <button class="btn-zoom" (click)="treeComponent?.centerAll()" title="Центриране">⌖</button>
          </div>

          <app-legend></app-legend>
        </main>

        @if (selectedPerson) {
          <div class="panel-backdrop" (click)="selectedPerson = null"></div>
          <app-person-panel
            [person]="selectedPerson"
            [allPersons]="allPersons"
            [allRelations]="allRelations"
            (closed)="selectedPerson = null"
            (focused)="onFocusPerson($event)"
            (edited)="openEditForm($event)"
            (deleted)="onDelete($event)"
            (relationDeleted)="onRelationDeleted()"
            (relationAdded)="onRelationDeleted()"
            (photoChanged)="onPhotoChanged($event)"
            (lightboxRequested)="onLightboxRequested($event)"
          ></app-person-panel>
        }
      </div>

      @if (showPersonForm) {
        <app-person-form
          [person]="editingPerson"
          [allPersons]="editingPerson ? [] : allPersons"
          (saved)="onPersonSave($event)"
          (cancelled)="showPersonForm = false"
        ></app-person-form>
      }

      @if (showRelationForm) {
        <app-relation-form
          [allPersons]="allPersons"
          [focusedId]="focusedId"
          (saved)="onRelationSave()"
          (cancelled)="showRelationForm = false"
        ></app-relation-form>
      }

      @if (lightboxPhoto) {
        <div class="lightbox" (click)="lightboxPhoto = null" (keydown.escape)="lightboxPhoto = null" tabindex="0">
          <button class="lightbox-close" (click)="lightboxPhoto = null">✕</button>
          <img [src]="lightboxPhoto.url" [alt]="lightboxPhoto.caption || ''" (click)="$event.stopPropagation()" />
          @if (lightboxPhoto.caption) {
            <p class="lightbox-caption">{{ lightboxPhoto.caption }}</p>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    .toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 0 20px; height: 56px; background: var(--surface);
      box-shadow: 0 2px 8px rgba(0,0,0,0.08); flex-shrink: 0; z-index: 10;
    }
    .toolbar-left {
      display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;
    }
    .btn-back { background: none; border: none; cursor: pointer; font-size: 15px; color: #4A90D9; padding: 6px; flex-shrink: 0; }
    .title { font-weight: 700; font-size: 17px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .actions { display: flex; gap: 10px; flex-shrink: 0; }
    .btn-primary { padding: 8px 16px; background: #4A90D9; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .btn-secondary { padding: 8px 16px; background: var(--surface2); color: var(--text); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 14px; }
    .btn-export { padding: 8px 14px; background: var(--surface2); color: var(--text); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 14px; }
    .btn-theme { padding: 8px 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 16px; line-height: 1; }
    .content-wrap { flex: 1; display: flex; overflow: hidden; }
    .canvas-wrap { flex: 1; position: relative; background: var(--bg); }
    .zoom-controls {
      position: absolute;
      bottom: 20px;
      left: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 50;
    }
    .btn-zoom {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      transition: all 0.2s ease;
      user-select: none;
      padding: 0;
    }
    .btn-zoom:hover {
      background: var(--surface2);
      border-color: #4A90D9;
      color: #4A90D9;
      transform: scale(1.05);
    }
    .btn-zoom:active {
      transform: scale(0.95);
    }
    .empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
    .lightbox {
      position: fixed; inset: 0; background: rgba(0,0,0,0.9);
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; z-index: 1000; cursor: pointer; outline: none;
    }
    .lightbox img {
      max-width: 95vw; max-height: 90vh;
      object-fit: contain; border-radius: 6px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.6); cursor: default;
    }
    .lightbox-caption { color: #eee; margin-top: 14px; font-size: 15px; }
    .lightbox-close {
      position: absolute; top: 20px; right: 24px;
      background: rgba(255,255,255,0.15); border: none; border-radius: 50%;
      color: #fff; font-size: 22px; width: 44px; height: 44px;
      cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 1001;
    }
    .lightbox-close:hover { background: rgba(255,255,255,0.3); }

    .panel-backdrop {
      display: none;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @media (max-width: 600px) {
      .toolbar {
        flex-direction: column;
        align-items: stretch;
        height: auto;
        padding: 10px 16px;
        gap: 8px;
      }
      .toolbar-left {
        width: 100%;
        justify-content: space-between;
      }
      .actions {
        width: 100%;
        justify-content: flex-start;
        gap: 6px;
      }
      .btn-primary, .btn-secondary, .btn-export, .btn-theme {
        padding: 6px 10px;
        font-size: 12px;
        flex: 1;
        justify-content: center;
        text-align: center;
      }
      .btn-theme {
        flex: 0 0 auto;
      }
      .panel-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(2px);
        z-index: 90;
        animation: fadeIn 0.2s ease-out forwards;
      }
    }
  `]
})
export class TreePageComponent implements OnInit {
  @ViewChild(TreeComponent) treeComponent?: TreeComponent;
  focusedId: string = '';
  focusedPerson: Person | null = null;
  lightboxPhoto: PersonPhoto | null = null;
  allPersons: Person[] = [];
  allRelations: any[] = [];
  fullGraph: GraphData | null = null;
  filteredGraph: GraphData | null = null;
  selectedPerson: Person | null = null;
  showPersonForm = false;
  showRelationForm = false;
  editingPerson: Person | null = null;

  constructor(
    private route: ActivatedRoute,
    public router: Router,
    private api: ApiService,
    private graphService: GraphService,
    public theme: ThemeService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.focusedId = this.route.snapshot.paramMap.get('id') ?? '';
    this.loadAll();
  }

  loadAll(): void {
    this.api.getPersons().subscribe(persons => {
      this.allPersons = persons;
      this.focusedPerson = persons.find(p => p.id === this.focusedId) ?? null;
      this.cdr.detectChanges();
    });
    this.api.getRelations().subscribe(relations => {
      this.allRelations = relations;
      this.cdr.detectChanges();
    });
    this.api.getGraph().subscribe(data => {
      this.fullGraph = data;
      this.applyFilter();
    });
  }

  applyFilter(): void {
    if (!this.fullGraph || !this.focusedId) return;
    this.filteredGraph = this.graphService.getFocusedSubgraph(this.focusedId, this.fullGraph);
    this.cdr.detectChanges();
  }

  onNodeClick(id: string): void {
    this.api.getPerson(id).subscribe(p => {
      this.selectedPerson = p;
      this.cdr.detectChanges();
    });
  }

  onFocusPerson(id: string): void {
    this.focusedId = id;
    this.focusedPerson = this.allPersons.find(p => p.id === id) ?? null;
    this.applyFilter();
    this.selectedPerson = null;
    this.router.navigate(['/tree', id], { replaceUrl: true });
  }

  openAddForm(): void {
    this.editingPerson = null;
    this.showPersonForm = true;
  }

  openEditForm(id: string): void {
    this.api.getPerson(id).subscribe(p => {
      this.editingPerson = p;
      this.showPersonForm = true;
      this.cdr.detectChanges();
    });
  }

  onPersonSave(event: { data: PersonCreate; file?: File; relations?: PersonFormRelation[] }): void {
    const save$ = this.editingPerson
      ? this.api.updatePerson(this.editingPerson.id, event.data)
      : this.api.createPerson(event.data);

    save$.subscribe(person => {
      const createRelations = () => {
        const rels = event.relations ?? [];
        if (rels.length === 0) { this.loadAll(); return; }
        let remaining = rels.length;
        const done = () => { if (--remaining === 0) this.loadAll(); };
        rels.forEach(rel => {
          const { relation_type, direction, otherId } = rel;
          const person_a_id = direction === 'a_to_b' ? person.id : otherId;
          const person_b_id = direction === 'a_to_b' ? otherId : person.id;
          this.api.createRelation({ person_a_id, person_b_id, relation_type }).subscribe({ next: done, error: done });
        });
      };
      if (event.file) {
        this.api.uploadPhoto(person.id, event.file).subscribe(createRelations);
      } else {
        createRelations();
      }
    });
    this.showPersonForm = false;
  }

  onRelationSave(): void {
    this.showRelationForm = false;
    this.loadAll();
  }

  onRelationDeleted(): void {
    this.loadAll();
  }

  onPhotoChanged(photoUrl: string | null): void {
    if (!this.selectedPerson) return;
    const personId = this.selectedPerson.id;
    this.selectedPerson = { ...this.selectedPerson, photo_url: photoUrl ?? undefined };
    this.zone.runOutsideAngular(() => {
      this.treeComponent?.updateNodePhoto(personId, photoUrl);
    });
    this.cdr.detectChanges();
  }

  onLightboxRequested(photo: PersonPhoto): void {
    console.log('onLightboxRequested called', photo.url);
    this.lightboxPhoto = photo;
    this.cdr.detectChanges();
    console.log('lightboxPhoto set to', this.lightboxPhoto);
    setTimeout(() => (document.querySelector('.lightbox') as HTMLElement)?.focus(), 0);
  }

  exportPng(): void {
    const name = this.focusedPerson
      ? `${this.focusedPerson.first_name}-${this.focusedPerson.last_name}-family-tree.png`
      : 'family-tree.png';
    this.treeComponent?.exportPng(name);
  }

  onDelete(id: string): void {
    if (!confirm('Сигурен ли си?')) return;
    this.api.deletePerson(id).subscribe(() => {
      this.selectedPerson = null;
      if (id === this.focusedId) {
        this.router.navigate(['/']);
      } else {
        this.loadAll();
      }
    });
  }
}
