import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { PersonCreate, Person } from '../../models/person.model';
import { RelationType } from '../../models/relation.model';
import { GEN_RANGES } from '../tree/tree.component';

export interface PersonFormRelation {
  relation_type: RelationType;
  direction: 'a_to_b' | 'b_to_a';
  otherId: string;
}

@Component({
  selector: 'app-person-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="overlay" (click)="onOverlayClick($event)">
      <div class="modal">
        <h3>{{ person ? 'Редактирай' : 'Добави' }} човек</h3>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div class="field">
            <label>Собствено име *</label>
            <input formControlName="first_name" placeholder="Иван" />
          </div>
          <div class="field">
            <label>Фамилия *</label>
            <input formControlName="last_name" placeholder="Иванов" />
          </div>
          <div class="field">
            <label>Дата на раждане</label>
            <input type="date" formControlName="birth_date" (change)="onBirthDateChange()" />
          </div>
          @if (!form.value.birth_date) {
            <div class="field">
              <label>Поколение <span class="hint">(ако няма дата на раждане)</span></label>
              <select formControlName="generation_hint">
                <option [ngValue]="null">— Неизвестно —</option>
                @for (g of genRanges; track g.from) {
                  <option [ngValue]="g.from">{{ g.name }} ({{ g.from }}–{{ g.to }})</option>
                }
              </select>
            </div>
          }
          <div class="field">
            <label>Дата на смърт</label>
            <input type="date" formControlName="death_date" />
          </div>
          <div class="field">
            <label>Биография</label>
            <textarea formControlName="bio" rows="4" placeholder="Кратко описание..."></textarea>
          </div>

          @if (person) {
            <div class="field">
              <label>Снимка</label>
              <input type="file" accept="image/jpeg,image/png,image/webp" (change)="onFileChange($event)" />
            </div>
          }

          @if (!person && allPersons.length > 0) {
            <div class="divider"></div>
            <div class="section-header">
              <span class="section-title">Връзки <span class="hint">(незадължително)</span></span>
              <button type="button" class="btn-add-rel" (click)="addRelation()">+ Добави</button>
            </div>
          }

          <div formArrayName="relations">
            @for (relGroup of relationsArray.controls; track $index; let i = $index) {
              <div class="relation-row" [formGroupName]="i">
                <div class="relation-fields">
                  <select formControlName="rel_type" (change)="onRelTypeChange(i)">
                    <option value="">— Тип —</option>
                    <option value="child_of">Дете на</option>
                    <option value="parent_of">Родител на</option>
                    <option value="SPOUSE">Съпруг / Съпруга на</option>
                    <option value="SIBLING">Брат / Сестра на</option>
                  </select>
                  <select formControlName="rel_person_id" [attr.disabled]="!relGroup.value.rel_type || null">
                    <option value="">— Човек —</option>
                    @for (p of allPersons; track p.id) {
                      <option [value]="p.id">{{ p.first_name }} {{ p.last_name }}</option>
                    }
                  </select>
                </div>
                <button type="button" class="btn-remove-rel" (click)="removeRelation(i)" title="Премахни">✕</button>
              </div>
            }
          </div>

          <div class="btn-row">
            <button type="button" class="btn-cancel" (click)="cancelled.emit()">Откажи</button>
            <button type="submit" class="btn-save" [disabled]="form.invalid || !areRelationsValid">Запази</button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center; z-index: 200;
    }
    .modal {
      background: var(--surface); border-radius: 12px;
      padding: 28px 24px; width: 460px; max-width: 95vw;
      max-height: 90vh; overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    }
    h3 { margin: 0 0 20px; font-size: 18px; color: var(--text); }
    .divider { border: none; border-top: 1px solid var(--border); margin: 8px 0 16px; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .section-title { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
    label { font-size: 13px; color: var(--text); font-weight: 500; }
    input, textarea, select { padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; outline: none; background: var(--surface); color: var(--text); }
    input:focus, textarea:focus, select:focus { border-color: #4A90D9; }
    select:disabled { opacity: 0.5; cursor: not-allowed; }
    .hint { font-size: 11px; color: var(--text-muted); font-weight: 400; }
    textarea { resize: vertical; }
    .relation-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .relation-fields { display: flex; flex: 1; gap: 8px; }
    .relation-fields select { flex: 1; min-width: 0; }
    .btn-add-rel { padding: 4px 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 12px; cursor: pointer; white-space: nowrap; }
    .btn-add-rel:hover { border-color: #4A90D9; color: #4A90D9; }
    .btn-remove-rel { width: 28px; height: 28px; flex-shrink: 0; background: none; border: 1px solid var(--border); border-radius: 50%; color: var(--text-muted); font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .btn-remove-rel:hover { border-color: #e55; color: #e55; }
    .btn-row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
    .btn-cancel { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); cursor: pointer; }
    .btn-save { padding: 8px 20px; border-radius: 6px; border: none; background: #4A90D9; color: #fff; cursor: pointer; }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
  `]
})
export class PersonFormComponent implements OnInit {
  @Input() person: Person | null = null;
  @Input() allPersons: Person[] = [];
  @Output() saved = new EventEmitter<{ data: PersonCreate; file?: File; relations?: PersonFormRelation[] }>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;
  selectedFile?: File;
  protected readonly genRanges = GEN_RANGES;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      first_name: [this.person?.first_name ?? '', Validators.required],
      last_name: [this.person?.last_name ?? '', Validators.required],
      birth_date: [this.person?.birth_date ?? ''],
      death_date: [this.person?.death_date ?? ''],
      generation_hint: [this.person?.generation_hint ?? null],
      bio: [this.person?.bio ?? ''],
      relations: this.fb.array([]),
    });
  }

  get relationsArray(): FormArray {
    return this.form.get('relations') as FormArray;
  }

  get areRelationsValid(): boolean {
    return this.relationsArray.controls.every(g => {
      const { rel_type, rel_person_id } = g.value;
      return !rel_type || !!rel_person_id;
    });
  }

  addRelation(): void {
    this.relationsArray.push(this.fb.group({ rel_type: [''], rel_person_id: [''] }));
  }

  removeRelation(index: number): void {
    this.relationsArray.removeAt(index);
  }

  onRelTypeChange(index: number): void {
    this.relationsArray.at(index).patchValue({ rel_person_id: '' });
  }

  onBirthDateChange(): void {
    if (this.form.value.birth_date) {
      this.form.patchValue({ generation_hint: null });
    }
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.selectedFile = input.files[0];
  }

  onSubmit(): void {
    if (this.form.invalid || !this.areRelationsValid) return;
    const raw = this.form.value;
    const data: PersonCreate = {
      first_name: raw.first_name,
      last_name: raw.last_name,
      birth_date: raw.birth_date || null,
      death_date: raw.death_date || null,
      generation_hint: raw.birth_date ? null : (raw.generation_hint ?? null),
      bio: raw.bio || null,
    };

    const relations: PersonFormRelation[] = (raw.relations as { rel_type: string; rel_person_id: string }[])
      .filter(r => r.rel_type && r.rel_person_id)
      .map(r => {
        if (r.rel_type === 'child_of') {
          return { relation_type: 'PARENT_CHILD' as RelationType, direction: 'b_to_a' as const, otherId: r.rel_person_id };
        } else if (r.rel_type === 'parent_of') {
          return { relation_type: 'PARENT_CHILD' as RelationType, direction: 'a_to_b' as const, otherId: r.rel_person_id };
        } else {
          return { relation_type: r.rel_type as RelationType, direction: 'a_to_b' as const, otherId: r.rel_person_id };
        }
      });

    this.saved.emit({ data, file: this.selectedFile, relations: relations.length ? relations : undefined });
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('overlay')) {
      this.cancelled.emit();
    }
  }
}
