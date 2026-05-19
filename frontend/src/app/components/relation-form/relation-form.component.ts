import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { forkJoin, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { Person } from '../../models/person.model';
import { RelationType } from '../../models/relation.model';

@Component({
  selector: 'app-relation-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="overlay" (click)="onOverlayClick($event)">
      <div class="modal">
        <h3>Добави връзка</h3>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">

          <div class="field">
            <label>Тип връзка *</label>
            <select formControlName="relation_type">
              <option value="">— Избери —</option>
              <option value="PARENT_CHILD">Родител → Дете</option>
              <option value="SPOUSE">Съпруг / Съпруга</option>
              <option value="SIBLING">Брат / Сестра</option>
            </select>
          </div>

          @if (isParentChild) {
            <!-- PARENT_CHILD - специален layout -->
            <div class="field">
              <label>Първи родител *</label>
              <select formControlName="person_a_id">
                <option value="">— Избери —</option>
                @for (p of allPersons; track p.id) {
                  @if (p.id !== form.get('person_b_id')?.value && p.id !== form.get('second_parent_id')?.value) {
                    <option [value]="p.id">{{ p.first_name }} {{ p.last_name }}</option>
                  }
                }
              </select>
            </div>

            <div class="field">
              <label>Втори родител <span class="optional">(незадължително)</span></label>
              <select formControlName="second_parent_id">
                <option value="">— Няма / не е известен —</option>
                @for (p of allPersons; track p.id) {
                  @if (p.id !== form.get('person_a_id')?.value && p.id !== form.get('person_b_id')?.value) {
                    <option [value]="p.id">{{ p.first_name }} {{ p.last_name }}</option>
                  }
                }
              </select>
            </div>

            <div class="field">
              <label>Дете *</label>
              <select formControlName="person_b_id">
                <option value="">— Избери —</option>
                @for (p of allPersons; track p.id) {
                  @if (p.id !== form.get('person_a_id')?.value && p.id !== form.get('second_parent_id')?.value) {
                    <option [value]="p.id">{{ p.first_name }} {{ p.last_name }}</option>
                  }
                }
              </select>
            </div>

          } @else {
            <!-- SPOUSE / SIBLING - стандартен layout -->
            <div class="field">
              <label>Първи човек *</label>
              <select formControlName="person_a_id">
                <option value="">— Избери —</option>
                @for (p of allPersons; track p.id) {
                  @if (p.id !== form.get('person_b_id')?.value) {
                    <option [value]="p.id">{{ p.first_name }} {{ p.last_name }}</option>
                  }
                }
              </select>
            </div>

            <div class="field">
              <label>Втори човек *</label>
              <select formControlName="person_b_id">
                <option value="">— Избери —</option>
                @for (p of allPersons; track p.id) {
                  @if (p.id !== form.get('person_a_id')?.value) {
                    <option [value]="p.id">{{ p.first_name }} {{ p.last_name }}</option>
                  }
                }
              </select>
            </div>
          }

          @if (error) {
            <p class="error">{{ error }}</p>
          }

          <div class="btn-row">
            <button type="button" class="btn-cancel" (click)="cancelled.emit()">Откажи</button>
            <button type="submit" class="btn-save" [disabled]="!isValid || loading">
              {{ loading ? 'Запазване...' : 'Запази' }}
            </button>
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
    .modal { background: var(--surface); border-radius: 12px; padding: 28px 24px; width: 440px; max-width: 95vw; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
    h3 { margin: 0 0 20px; font-size: 18px; color: var(--text); }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
    label { font-size: 13px; color: var(--text); font-weight: 500; }
    .optional { font-weight: 400; color: var(--text-muted); }
    select { padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; outline: none; background: var(--surface); color: var(--text); }
    select:focus { border-color: #4A90D9; }
    .error { color: #c0392b; font-size: 13px; margin-bottom: 8px; }
    .btn-row { display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px; }
    .btn-cancel { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); cursor: pointer; }
    .btn-save { padding: 8px 20px; border-radius: 6px; border: none; background: #4A90D9; color: #fff; cursor: pointer; }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
  `]
})
export class RelationFormComponent implements OnInit {
  @Input() allPersons: Person[] = [];
  @Input() focusedId: string = '';
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;
  loading = false;
  error = '';

  constructor(private fb: FormBuilder, private api: ApiService) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      relation_type: ['', Validators.required],
      person_a_id: [this.focusedId, Validators.required],
      person_b_id: ['', Validators.required],
      second_parent_id: [''],
    });
  }

  get isParentChild(): boolean {
    return this.form.get('relation_type')?.value === 'PARENT_CHILD';
  }

  get isValid(): boolean {
    const { relation_type, person_a_id, person_b_id } = this.form.value;
    return !!relation_type && !!person_a_id && !!person_b_id;
  }

  onSubmit(): void {
    if (!this.isValid) return;
    this.loading = true;
    this.error = '';

    const { relation_type, person_a_id, person_b_id, second_parent_id } = this.form.value;

    if (relation_type === 'PARENT_CHILD') {
      // Създай 1 или 2 PARENT_CHILD връзки
      const ignore409 = catchError((err: any) => err.status === 409 ? of(null) : throwError(() => err));
      const req1 = this.api.createRelation({ person_a_id, person_b_id, relation_type: 'PARENT_CHILD' }).pipe(ignore409);
      const req2 = second_parent_id
        ? this.api.createRelation({ person_a_id: second_parent_id, person_b_id, relation_type: 'PARENT_CHILD' }).pipe(ignore409)
        : of(null);

      forkJoin([req1, req2]).subscribe({
        next: () => { this.loading = false; this.saved.emit(); },
        error: err => { this.loading = false; this.error = err.error?.detail ?? 'Грешка при запазване'; }
      });
    } else {
      this.api.createRelation({ person_a_id, person_b_id, relation_type }).subscribe({
        next: () => { this.loading = false; this.saved.emit(); },
        error: err => { this.loading = false; this.error = err.error?.detail ?? 'Грешка при запазване'; }
      });
    }
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('overlay')) {
      this.cancelled.emit();
    }
  }
}
