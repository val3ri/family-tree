import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Person, PersonPhoto } from '../../models/person.model';
import { Relation, RelationType, RelationUpdate } from '../../models/relation.model';
import { ApiService } from '../../services/api.service';

const RELATION_LABELS: Record<RelationType, string> = {
  PARENT_CHILD: 'Родител / Дете',
  SPOUSE: 'Съпруг / Съпруга',
  SIBLING: 'Брат / Сестра',
};

const RELATION_COLORS: Record<RelationType, string> = {
  PARENT_CHILD: '#4A90D9',
  SPOUSE: '#E05C5C',
  SIBLING: '#4CAF50',
};

interface RelationRow {
  relation: Relation;
  otherPerson: Person;
  label: string;
  color: string;
  directionLabel: string;
}

@Component({
  selector: 'app-person-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (person) {
      <div class="panel">
        <div class="drag-handle"></div>
        <button class="close-btn" (click)="closed.emit()">✕</button>

        <div class="photo-wrap">
          @if (person.photo_url) {
            <img [src]="person.photo_url" [alt]="fullName" />
          } @else {
            <div class="initials">{{ initials }}</div>
          }
        </div>

        <h2>{{ fullName }}</h2>

        @if (person.birth_date) {
          <div class="dates">
            <span>{{ person.birth_date | date:'dd.MM.yyyy' }}</span>
            @if (person.death_date) {
              <span> – {{ person.death_date | date:'dd.MM.yyyy' }}</span>
            }
          </div>
          <div class="age">
            @if (person.death_date) {
              Починал на {{ calcAge(person.birth_date, person.death_date) }} г. / {{ calcDays(person.birth_date, person.death_date) }} дни
            } @else {
              {{ calcAge(person.birth_date) }} години / {{ calcDays(person.birth_date) }} дни
            }
          </div>
        }

        @if (person.birth_place || person.birth_time || person.death_place) {
          <div class="info-group">
            @if (person.birth_place || person.birth_time) {
              <div class="info-item">
                <span class="info-label">👶 Раждане</span>
                <span class="info-val">
                  @if (person.birth_time) {
                    <span>в {{ person.birth_time }} ч.</span>
                  }
                  @if (person.birth_place) {
                    <span>{{ person.birth_time ? ', ' : '' }}{{ person.birth_place }}</span>
                  }
                </span>
              </div>
            }
            @if (person.death_place) {
              <div class="info-item">
                <span class="info-label">🕯️ Място на смъртта</span>
                <span class="info-val">{{ person.death_place }}</span>
              </div>
            }
          </div>
        }

        @if (person.education || person.profession || person.residence) {
          <div class="bio-details">
            @if (person.education) {
              <div class="bio-detail-item">
                <span class="detail-icon">🎓</span>
                <span class="detail-text" title="Образование">{{ person.education }}</span>
              </div>
            }
            @if (person.profession) {
              <div class="bio-detail-item">
                <span class="detail-icon">💼</span>
                <span class="detail-text" title="Професия / Занаят">{{ person.profession }}</span>
              </div>
            }
            @if (person.residence) {
              <div class="bio-detail-item">
                <span class="detail-icon">📍</span>
                <span class="detail-text" title="Местоживеене">{{ person.residence }}</span>
              </div>
            }
          </div>
        }

        @if (person.bio) {
          <p class="bio">{{ person.bio }}</p>
        }

        <!-- Галерия -->
        <div class="section-title">Снимки</div>
        <div class="gallery">
          @for (photo of person.photos; track photo.id) {
            <div class="gallery-item" [class.is-profile]="photo.url === person.photo_url">
              <div class="gallery-img-wrap" (click)="openLightbox(photo)">
                <img [src]="photo.url" [alt]="photo.caption || ''" />
                <div class="gallery-overlay">🔍</div>
              </div>
              @if (photo.caption) {
                <span class="gallery-caption">{{ photo.caption }}</span>
              }
              <div class="gallery-actions">
                @if (photo.url !== person.photo_url) {
                  <button class="btn-set-profile" (click)="setProfile(photo)" title="Задай като профилна">★</button>
                } @else {
                  <button class="btn-unset-profile" (click)="unsetProfile()" title="Махни профилната снимка">★</button>
                }
                <button class="btn-photo-delete" (click)="deletePhoto(photo)" title="Изтрий снимката">✕</button>
              </div>
            </div>
          }
          <label class="gallery-add"
            [class.drag-over]="isDragOver"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave()"
            (drop)="onDrop($event)">
            <input type="file" accept="image/jpeg,image/png,image/webp" (change)="onGalleryFileChange($event)" hidden />
            <span>{{ isDragOver ? '↓' : '+' }}</span>
          </label>
        </div>

        <!-- Връзки -->
        <div class="section-header">
          <div class="section-title">Връзки</div>
          @if (!showAddRelation) {
            <button class="btn-add-rel" (click)="openAddRelation()">+ Добави</button>
          }
        </div>

        @if (showAddRelation) {
          <div class="add-relation-form">
            <div class="rel-field">
              <select [(ngModel)]="newRelType">
                <option value="">— Тип връзка —</option>
                <option value="child_of">Дете на</option>
                <option value="parent_of">Родител на</option>
                <option value="SPOUSE">Съпруг / Съпруга на</option>
                <option value="SIBLING">Брат / Сестра на</option>
              </select>
            </div>
            @if (newRelType) {
              <div class="rel-field">
                <select [(ngModel)]="newRelPersonId">
                  <option value="">— Избери човек —</option>
                  @for (p of availablePersons; track p.id) {
                    <option [value]="p.id">{{ p.first_name }} {{ p.last_name }}</option>
                  }
                </select>
              </div>
            }
            @if (newRelType === 'SPOUSE') {
              <div class="rel-field-row">
                <div class="rel-field">
                  <label class="rel-field-label">Дата на брак</label>
                  <input type="date" [(ngModel)]="newMarriageDate" />
                </div>
                <div class="rel-field">
                  <label class="rel-field-label">Място на брак</label>
                  <input [(ngModel)]="newMarriagePlace" placeholder="гр. София" />
                </div>
              </div>
              <div class="rel-field">
                <label class="divorce-check">
                  <input type="checkbox" [(ngModel)]="newIsDivorced" />
                  Разведени / Разделени
                </label>
              </div>
            }
            @if (addRelError) {
              <p class="rel-error">{{ addRelError }}</p>
            }
            <div class="rel-form-actions">
              <button class="btn-rel-cancel" (click)="closeAddRelation()">Откажи</button>
              <button class="btn-rel-save" [disabled]="!newRelType || !newRelPersonId || addRelLoading" (click)="submitAddRelation()">
                {{ addRelLoading ? 'Запазване...' : 'Запази' }}
              </button>
            </div>
          </div>
        }

        @if (relationRows.length === 0 && !showAddRelation) {
          <p class="no-relations">Няма добавени връзки</p>
        } @else if (relationRows.length > 0) {
          <div class="relations-list">
            @for (row of relationRows; track row.relation.id) {
              <div class="relation-row" [class.is-divorced]="row.relation.is_divorced">
                <span class="rel-dot" [style.background]="row.color"></span>
                <div class="rel-info">
                  <div class="rel-name-row">
                    <span class="rel-name">{{ row.otherPerson.first_name }} {{ row.otherPerson.last_name }}</span>
                    @if (row.relation.is_divorced) {
                      <span class="badge-divorced">бивш/а</span>
                    }
                  </div>
                  <span class="rel-type">{{ row.directionLabel }}</span>
                  @if (row.relation.relation_type === 'SPOUSE') {
                    @if (row.relation.marriage_date || row.relation.marriage_place) {
                      <span class="rel-marriage">💍
                        @if (row.relation.marriage_date) { {{ row.relation.marriage_date | date:'dd.MM.yyyy' }} }
                        @if (row.relation.marriage_place) { , {{ row.relation.marriage_place }} }
                      </span>
                    }
                    @if (editingMarriageId !== row.relation.id) {
                      <button class="btn-edit-marriage" (click)="openMarriageEdit(row)">✏️ Детайли за брака</button>
                    } @else {
                      <div class="marriage-edit-form">
                        <div class="rel-field-row">
                          <div class="rel-field">
                            <label class="rel-field-label">Дата на брак</label>
                            <input type="date" [(ngModel)]="editMarriageDate" />
                          </div>
                          <div class="rel-field">
                            <label class="rel-field-label">Място</label>
                            <input [(ngModel)]="editMarriagePlace" placeholder="гр. София" />
                          </div>
                        </div>
                        <label class="divorce-check">
                          <input type="checkbox" [(ngModel)]="editIsDivorced" />
                          Разведени / Разделени
                        </label>
                        <div class="rel-form-actions">
                          <button class="btn-rel-cancel" (click)="closeMarriageEdit()">Откажи</button>
                          <button class="btn-rel-save" (click)="saveMarriageEdit(row)">Запази</button>
                        </div>
                      </div>
                    }
                  }
                </div>
                <button class="btn-rel-delete" (click)="deleteRelation(row)" title="Изтрий връзката">✕</button>
              </div>
            }
          </div>
        }

        <div class="actions">
          <button class="btn-focus" (click)="focused.emit(person!.id)">Фокусирай</button>
          <button class="btn-edit" (click)="edited.emit(person!.id)">Редактирай</button>
          <button class="btn-delete" (click)="deleted.emit(person!.id)">Изтрий човека</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .panel {
      position: relative; width: 320px; flex-shrink: 0;
      background: var(--surface); box-shadow: -4px 0 20px rgba(0,0,0,0.12);
      padding: 24px 20px; overflow-y: auto; height: 100%;
      display: flex; flex-direction: column; gap: 12px;
      box-sizing: border-box;
    }
    .close-btn {
      position: absolute; top: 12px; right: 16px;
      background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-muted);
    }
    .photo-wrap { display: flex; justify-content: center; margin-top: 8px; }
    img { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #4A90D9; }
    .initials {
      width: 120px; height: 120px; border-radius: 50%;
      background: var(--node-fill); display: flex; align-items: center;
      justify-content: center; font-size: 36px; font-weight: bold; color: #4A90D9;
    }
    h2 { text-align: center; margin: 0; font-size: 18px; color: var(--text); }
    .dates { text-align: center; color: var(--text-muted); font-size: 13px; }
    .age { text-align: center; color: var(--text-muted); font-size: 12px; margin-top: -6px; }
    .info-group {
      background: var(--surface2); border-radius: 8px;
      padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;
      margin-top: 4px; border: 1px solid var(--border);
    }
    .info-item { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
    .info-label { font-size: 10px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-val { color: var(--text); line-height: 1.4; }
    .bio-details { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; border-left: 2px solid var(--border); padding-left: 10px; }
    .bio-detail-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); }
    .detail-icon { font-size: 16px; flex-shrink: 0; }
    .detail-text { line-height: 1.4; }
    .bio { color: var(--text); font-size: 14px; line-height: 1.5; }

    .section-title { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
    .btn-add-rel {
      font-size: 11px; font-weight: 600; color: #4A90D9;
      background: none; border: 1px solid #4A90D9; border-radius: 4px;
      padding: 2px 8px; cursor: pointer; line-height: 1.6;
    }
    .btn-add-rel:hover { background: var(--node-fill); }
    .no-relations { font-size: 13px; color: var(--text-muted); }

    .add-relation-form {
      background: var(--surface2); border-radius: 8px; padding: 10px 12px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .rel-field select {
      width: 100%; padding: 7px 9px; border: 1px solid var(--border);
      border-radius: 6px; font-size: 13px; background: var(--surface); color: var(--text); outline: none;
    }
    .rel-field select:focus { border-color: #4A90D9; }
    .rel-error { font-size: 12px; color: #c0392b; margin: 0; }
    .rel-form-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .btn-rel-cancel {
      padding: 5px 12px; border-radius: 5px; border: 1px solid var(--border);
      background: var(--surface2); color: var(--text); font-size: 12px; cursor: pointer;
    }
    .btn-rel-save {
      padding: 5px 14px; border-radius: 5px; border: none;
      background: #4A90D9; color: #fff; font-size: 12px; cursor: pointer;
    }
    .btn-rel-save:disabled { opacity: 0.5; cursor: not-allowed; }
    .rel-field-row { display: flex; gap: 8px; }
    .rel-field-row .rel-field { flex: 1; min-width: 0; }
    .rel-field-label { font-size: 11px; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 2px; }
    .rel-field input[type="date"], .rel-field input[type="text"], .rel-field input:not([type]) {
      width: 100%; padding: 6px 8px; border: 1px solid var(--border);
      border-radius: 5px; font-size: 12px; background: var(--surface); color: var(--text); outline: none; box-sizing: border-box;
    }
    .rel-field input:focus { border-color: #4A90D9; }
    .divorce-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text); cursor: pointer; }
    .divorce-check input { cursor: pointer; }

    .gallery { display: flex; flex-wrap: wrap; gap: 8px; }
    .gallery-item {
      position: relative; width: 80px;
      border-radius: 8px; overflow: hidden;
      border: 2px solid transparent;
      background: var(--surface2);
    }
    .gallery-item.is-profile { border-color: #FFD700; }
    .gallery-img-wrap {
      position: relative; width: 80px; height: 80px; cursor: pointer; overflow: hidden;
    }
    .gallery-img-wrap img { width: 80px; height: 80px; object-fit: cover; display: block; }
    .gallery-overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0); display: flex; align-items: center;
      justify-content: center; font-size: 20px; opacity: 0;
      transition: opacity 0.15s, background 0.15s;
    }
    .gallery-img-wrap:hover .gallery-overlay { opacity: 1; background: rgba(0,0,0,0.35); }
    .gallery-caption {
      display: block; font-size: 10px; color: var(--text-muted);
      padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .gallery-actions {
      display: flex; align-items: center; justify-content: space-between;
      padding: 2px 4px; background: var(--surface2);
    }
    .btn-set-profile {
      background: none; border: none; cursor: pointer;
      color: var(--text-muted); font-size: 14px; padding: 0; line-height: 1;
    }
    .btn-set-profile:hover { color: #FFD700; }
    .btn-unset-profile {
      background: none; border: none; cursor: pointer;
      color: #FFD700; font-size: 14px; padding: 0; line-height: 1;
    }
    .btn-unset-profile:hover { color: var(--text-muted); }
    .btn-photo-delete {
      background: none; border: none; cursor: pointer;
      color: var(--text-muted); font-size: 12px; padding: 0; line-height: 1;
    }
    .btn-photo-delete:hover { color: #c0392b; }
    .gallery-add {
      width: 80px; height: 80px; border-radius: 8px;
      border: 2px dashed var(--border); display: flex; align-items: center;
      justify-content: center; cursor: pointer; color: var(--text-muted); font-size: 28px;
      flex-shrink: 0;
    }
    .gallery-add:hover { border-color: #4A90D9; color: #4A90D9; }
    .gallery-add.drag-over { border-color: #4A90D9; background: var(--node-fill); color: #4A90D9; }

    .relations-list { display: flex; flex-direction: column; gap: 6px; }
    .relation-row {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 7px 10px; background: var(--surface2); border-radius: 8px;
    }
    .relation-row.is-divorced { opacity: 0.72; }
    .rel-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
    .rel-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .rel-name-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .rel-name { font-size: 14px; color: var(--text); font-weight: 500; }
    .badge-divorced {
      font-size: 10px; background: #f39c12; color: #fff;
      border-radius: 4px; padding: 1px 5px; font-weight: 600;
    }
    .rel-type { font-size: 11px; color: var(--text-muted); }
    .rel-marriage { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
    .btn-edit-marriage {
      font-size: 11px; background: none; border: none; color: #4A90D9;
      cursor: pointer; padding: 0; margin-top: 3px; text-align: left;
    }
    .btn-edit-marriage:hover { text-decoration: underline; }
    .marriage-edit-form { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--border); }
    .btn-rel-delete {
      background: none; border: none; cursor: pointer; color: var(--text-muted);
      font-size: 14px; padding: 2px 4px; border-radius: 4px; line-height: 1;
    }
    .btn-rel-delete:hover { color: #c0392b; background: #ffeaea; }

    .actions { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
    button { padding: 8px; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; }
    .btn-focus { background: #4A90D9; color: #fff; }
    .btn-edit { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
    .btn-delete { background: #ffeaea; color: #c0392b; }

    .drag-handle {
      display: none;
    }

    @keyframes slideUp {
      from {
        transform: translateY(100%);
      }
      to {
        transform: translateY(0);
      }
    }

    @media (max-width: 600px) {
      .panel {
        position: fixed; bottom: 0; left: 0; right: 0;
        width: 100%; height: 65vh;
        border-radius: 24px 24px 0 0;
        box-shadow: 0 -8px 30px rgba(0,0,0,0.2);
        z-index: 100;
        animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .drag-handle {
        display: block;
        width: 40px;
        height: 5px;
        background: var(--border);
        border-radius: 3px;
        margin: -10px auto 12px auto;
        flex-shrink: 0;
      }
      .close-btn {
        top: 16px;
        right: 20px;
      }
    }
  `]
})
export class PersonPanelComponent implements OnChanges {
  @Input() person: Person | null = null;
  @Input() allPersons: Person[] = [];
  @Input() allRelations: Relation[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() focused = new EventEmitter<string>();
  @Output() edited = new EventEmitter<string>();
  @Output() deleted = new EventEmitter<string>();
  @Output() relationDeleted = new EventEmitter<string>();
  @Output() relationAdded = new EventEmitter<void>();
  @Output() photoChanged = new EventEmitter<string | null>();
  @Output() lightboxRequested = new EventEmitter<PersonPhoto>();

  relationRows: RelationRow[] = [];
  showAddRelation = false;
  newRelType = '';
  newRelPersonId = '';
  newMarriageDate = '';
  newMarriagePlace = '';
  newIsDivorced = false;
  addRelLoading = false;
  addRelError = '';
  isDragOver = false;
  editingMarriageId: string | null = null;
  editMarriageDate = '';
  editMarriagePlace = '';
  editIsDivorced = false;

  constructor(private api: ApiService, private cdr: ChangeDetectorRef, private zone: NgZone) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['person'] || changes['allRelations'] || changes['allPersons']) {
      this.buildRelationRows();
      this.closeAddRelation();
    }
  }

  private buildRelationRows(): void {
    if (!this.person) { this.relationRows = []; return; }
    const id = this.person.id;
    const personMap = new Map(this.allPersons.map(p => [p.id, p]));

    this.relationRows = this.allRelations
      .filter(r => r.person_a_id === id || r.person_b_id === id)
      .map(r => {
        const otherId = r.person_a_id === id ? r.person_b_id : r.person_a_id;
        const other = personMap.get(otherId);
        if (!other) return null;

        let directionLabel = RELATION_LABELS[r.relation_type];
        if (r.relation_type === 'PARENT_CHILD') {
          directionLabel = r.person_a_id === id ? 'Родител на' : 'Дете на';
        }

        return {
          relation: r,
          otherPerson: other,
          label: RELATION_LABELS[r.relation_type],
          color: RELATION_COLORS[r.relation_type],
          directionLabel,
        } as RelationRow;
      })
      .filter((r): r is RelationRow => r !== null);
  }

  get availablePersons(): Person[] {
    if (!this.person) return [];
    const alreadyRelated = new Set(this.relationRows.map(r => r.otherPerson.id));
    return this.allPersons.filter(p => p.id !== this.person!.id && !alreadyRelated.has(p.id));
  }

  openAddRelation(): void {
    this.newRelType = '';
    this.newRelPersonId = '';
    this.addRelError = '';
    this.showAddRelation = true;
  }

  closeAddRelation(): void {
    this.showAddRelation = false;
    this.newRelType = '';
    this.newRelPersonId = '';
    this.newMarriageDate = '';
    this.newMarriagePlace = '';
    this.newIsDivorced = false;
    this.addRelError = '';
    this.addRelLoading = false;
  }

  submitAddRelation(): void {
    if (!this.person || !this.newRelType || !this.newRelPersonId) return;
    this.addRelLoading = true;
    this.addRelError = '';

    const myId = this.person.id;
    const otherId = this.newRelPersonId;

    let person_a_id: string;
    let person_b_id: string;
    let relation_type: RelationType;

    if (this.newRelType === 'child_of') {
      // Аз съм дете → другият е person_a (родител)
      person_a_id = otherId;
      person_b_id = myId;
      relation_type = 'PARENT_CHILD';
    } else if (this.newRelType === 'parent_of') {
      // Аз съм родител → аз съм person_a
      person_a_id = myId;
      person_b_id = otherId;
      relation_type = 'PARENT_CHILD';
    } else {
      person_a_id = myId;
      person_b_id = otherId;
      relation_type = this.newRelType as RelationType;
    }

    this.api.createRelation({
      person_a_id, person_b_id, relation_type,
      marriage_date: relation_type === 'SPOUSE' && this.newMarriageDate ? this.newMarriageDate : undefined,
      marriage_place: relation_type === 'SPOUSE' && this.newMarriagePlace ? this.newMarriagePlace : undefined,
      is_divorced: relation_type === 'SPOUSE' ? this.newIsDivorced : false,
    }).subscribe({
      next: () => {
        this.addRelLoading = false;
        this.closeAddRelation();
        this.relationAdded.emit();
      },
      error: err => {
        this.addRelLoading = false;
        this.addRelError = err.status === 409 ? 'Тази връзка вече съществува' : (err.error?.detail ?? 'Грешка при запазване');
        this.cdr.detectChanges();
      }
    });
  }

  openLightbox(photo: PersonPhoto): void {
    this.zone.run(() => { this.lightboxRequested.emit(photo); });
  }

  onGalleryFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.person) return;
    this.uploadPhoto(input.files[0]);
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(): void {
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    const file = event.dataTransfer?.files[0];
    if (!file || !this.person) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return;
    this.uploadPhoto(file);
  }

  private uploadPhoto(file: File): void {
    if (!this.person) return;
    const caption = prompt('Надпис за снимката (незадължително):') ?? '';
    this.api.addGalleryPhoto(this.person.id, file, caption).subscribe(photo => {
      this.person!.photos = [...(this.person!.photos ?? []), photo];
      this.cdr.detectChanges();
    });
  }

  setProfile(photo: PersonPhoto): void {
    if (!this.person) return;
    this.api.setProfilePhoto(this.person.id, photo.id).subscribe(updated => {
      this.person!.photo_url = updated.photo_url;
      this.cdr.detectChanges();
      this.photoChanged.emit(updated.photo_url ?? null);
    });
  }

  unsetProfile(): void {
    if (!this.person) return;
    this.api.unsetProfilePhoto(this.person.id).subscribe(() => {
      this.person!.photo_url = undefined;
      this.cdr.detectChanges();
      this.photoChanged.emit(null);
    });
  }

  deletePhoto(photo: PersonPhoto): void {
    if (!confirm('Изтрий снимката?') || !this.person) return;
    const wasProfile = photo.url === this.person.photo_url;
    this.api.deleteGalleryPhoto(this.person.id, photo.id).subscribe(() => {
      this.person!.photos = this.person!.photos.filter(p => p.id !== photo.id);
      if (wasProfile) this.person!.photo_url = undefined;
      this.cdr.detectChanges();
      this.photoChanged.emit(wasProfile ? null : this.person!.photo_url ?? null);
    });
  }

  deleteRelation(row: RelationRow): void {
    const name = `${row.otherPerson.first_name} ${row.otherPerson.last_name}`;
    if (!confirm(`Изтрий връзката с ${name}?`)) return;
    this.api.deleteRelation(row.relation.id).subscribe(() => {
      this.relationDeleted.emit(row.relation.id);
    });
  }

  openMarriageEdit(row: RelationRow): void {
    this.editingMarriageId = row.relation.id;
    this.editMarriageDate = row.relation.marriage_date ?? '';
    this.editMarriagePlace = row.relation.marriage_place ?? '';
    this.editIsDivorced = row.relation.is_divorced;
    this.cdr.detectChanges();
  }

  closeMarriageEdit(): void {
    this.editingMarriageId = null;
    this.cdr.detectChanges();
  }

  saveMarriageEdit(row: RelationRow): void {
    const data: RelationUpdate = {
      marriage_date: this.editMarriageDate || undefined,
      marriage_place: this.editMarriagePlace || undefined,
      is_divorced: this.editIsDivorced,
    };
    this.api.updateRelation(row.relation.id, data).subscribe(updated => {
      row.relation.marriage_date = updated.marriage_date;
      row.relation.marriage_place = updated.marriage_place;
      row.relation.is_divorced = updated.is_divorced;
      this.editingMarriageId = null;
      this.cdr.detectChanges();
    });
  }

  calcDays(birthDate: string, endDate?: string): string {
    const birth = new Date(birthDate);
    const end = endDate ? new Date(endDate) : new Date();
    const days = Math.floor((end.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
    return days.toLocaleString('bg-BG');
  }

  calcAge(birthDate: string, endDate?: string): number {
    const birth = new Date(birthDate);
    const end = endDate ? new Date(endDate) : new Date();
    let age = end.getFullYear() - birth.getFullYear();
    const notYetHadBirthday =
      end.getMonth() < birth.getMonth() ||
      (end.getMonth() === birth.getMonth() && end.getDate() < birth.getDate());
    if (notYetHadBirthday) age--;
    return age;
  }

  get fullName(): string {
    return this.person ? `${this.person.first_name} ${this.person.last_name}` : '';
  }

  get initials(): string {
    return this.person
      ? `${this.person.first_name[0]}${this.person.last_name[0]}`.toUpperCase()
      : '';
  }
}
