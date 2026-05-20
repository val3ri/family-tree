import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { ThemeService } from '../../services/theme.service';
import { Person, PersonCreate } from '../../models/person.model';
import { Relation } from '../../models/relation.model';
import { PersonFormComponent, PersonFormRelation } from '../person-form/person-form.component';
import { PersonPanelComponent } from '../person-panel/person-panel.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, PersonFormComponent, PersonPanelComponent],
  template: `
    <div class="page" [class.panel-open]="!!selectedPerson">
      <div class="main">
        <div class="hero">
          <div class="hero-header">
            <h1>🌳 Семейно дърво</h1>
            <button class="btn-theme" (click)="theme.toggle()" [title]="theme.isDark ? 'Светла тема' : 'Тъмна тема'">{{ theme.isDark ? '☀️' : '🌙' }}</button>
          </div>
          <p>Избери човек за да видиш неговото семейно дърво</p>
          <div class="hero-actions">
            <button class="btn-add" (click)="openAddForm()">+ Добави човек</button>
            <button class="btn-secondary-outline" (click)="exportBackup()">📤 Експорт</button>
            <button class="btn-secondary-outline" (click)="fileInput.click()">📥 Импорт</button>
            <input #fileInput type="file" (change)="importBackup($event)" accept=".zip,.json" style="display: none" />
          </div>
        </div>

        <div class="table-wrap">
          <div class="search-bar">
            <input
              [(ngModel)]="searchQuery"
              (ngModelChange)="onSearch()"
              placeholder="Търси по име или фамилия..."
              class="search-input"
            />
            @if (searchQuery) {
              <button class="search-clear" (click)="searchQuery = ''; onSearch()">✕</button>
            }
          </div>

          @if (allPersons.length === 0) {
            <div class="empty">
              <p>Все още няма добавени хора.</p>
              <button class="btn-add" (click)="openAddForm()">Добави първия човек</button>
            </div>
          } @else if (filtered.length === 0) {
            <div class="empty">
              <p>Няма резултати за „{{ searchQuery }}"</p>
            </div>
          } @else {
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th (click)="sortBy('first_name')" class="sortable">
                    Име {{ sortIcon('first_name') }}
                  </th>
                  <th (click)="sortBy('last_name')" class="sortable">
                    Фамилия {{ sortIcon('last_name') }}
                  </th>
                  <th (click)="sortBy('birth_date')" class="sortable">
                    Дата на раждане {{ sortIcon('birth_date') }}
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (p of filtered; track p.id) {
                  <tr (click)="openTree(p)" class="clickable-row" [class.selected]="selectedPerson?.id === p.id">
                    <td class="photo-cell">
                      @if (p.photo_url) {
                        <img [src]="p.photo_url" [alt]="p.first_name" />
                      } @else {
                        <div class="initials">{{ p.first_name[0] }}{{ p.last_name[0] }}</div>
                      }
                    </td>
                    <td>{{ p.first_name }}</td>
                    <td>{{ p.last_name }}</td>
                    <td>{{ p.birth_date ? (p.birth_date | date:'dd.MM.yyyy') : '—' }}</td>
                    <td class="actions-cell">
                      <span class="btn-view">Виж дървото →</span>
                      <button class="btn-edit-row" (click)="openPanel(p, $event)" title="Редактирай">✏️</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            @if (allPersons.length > 1) {
              <div class="count">{{ filtered.length }} от {{ allPersons.length }} човека</div>
            }
          }
        </div>
      </div>

      @if (selectedPerson) {
        <app-person-panel
          [person]="selectedPerson"
          [allPersons]="allPersons"
          [allRelations]="allRelations"
          (closed)="selectedPerson = null"
          (focused)="openTree(selectedPerson!)"
          (edited)="openEditForm($event)"
          (deleted)="onDelete($event)"
          (relationDeleted)="reload()"
          (relationAdded)="reload()"
          (photoChanged)="reload()"
        ></app-person-panel>
      }
    </div>

    @if (showForm) {
      <app-person-form
        [person]="editingPerson"
        [allPersons]="editingPerson ? [] : allPersons"
        (saved)="onSave($event)"
        (cancelled)="showForm = false; editingPerson = null"
      ></app-person-form>
    }
  `,
  styles: [`
    .page { min-height: 100vh; background: var(--bg); display: flex; }
    .main { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 40px 20px; overflow-y: auto; }

    .hero { text-align: center; margin-bottom: 40px; }
    .hero-header { display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 8px; }
    h1 { font-size: 36px; color: var(--text); margin-bottom: 0; }
    .btn-theme { padding: 8px 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 16px; line-height: 1; }
    p { color: var(--text-muted); font-size: 16px; margin-bottom: 20px; margin-top: 8px; }
    .btn-add { padding: 10px 22px; background: #4A90D9; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; }
    .hero-actions { display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap; }
    .btn-secondary-outline {
      padding: 10px 20px;
      background: none;
      color: #4A90D9;
      border: 1px solid #4A90D9;
      border-radius: 8px;
      cursor: pointer;
      font-size: 15px;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn-secondary-outline:hover {
      background: var(--surface2);
      transform: scale(1.02);
    }
    .btn-secondary-outline:active {
      transform: scale(0.98);
    }

    .table-wrap { width: 100%; max-width: 800px; background: var(--surface); border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.08); overflow: hidden; }

    .search-bar { position: relative; padding: 16px; border-bottom: 1px solid var(--border); }
    .search-input {
      width: 100%; padding: 10px 36px 10px 14px; border: 1px solid var(--border);
      border-radius: 8px; font-size: 15px; outline: none; box-sizing: border-box;
      background: var(--surface); color: var(--text);
    }
    .search-input:focus { border-color: #4A90D9; }
    .search-clear {
      position: absolute; right: 26px; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 4px;
    }
    .search-clear:hover { color: var(--text); }

    table { width: 100%; border-collapse: collapse; }
    thead { background: var(--bg); }
    th { padding: 12px 16px; text-align: left; font-size: 13px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    th.sortable { cursor: pointer; user-select: none; }
    th.sortable:hover { color: #4A90D9; }
    td { padding: 12px 16px; border-top: 1px solid var(--border); font-size: 15px; color: var(--text); vertical-align: middle; }
    .clickable-row { cursor: pointer; }
    .clickable-row:hover td { background: var(--surface2); }
    .clickable-row.selected td { background: var(--node-fill); }
    .photo-cell { width: 48px; }
    img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
    .initials { width: 40px; height: 40px; border-radius: 50%; background: var(--node-fill); display: flex; align-items: center; justify-content: center; font-weight: bold; color: #4A90D9; font-size: 14px; }
    .actions-cell { display: flex; align-items: center; gap: 12px; }
    .btn-view { color: #4A90D9; font-size: 13px; font-weight: 500; }
    .btn-edit-row {
      background: none; border: none; cursor: pointer; font-size: 15px;
      padding: 4px; border-radius: 4px; line-height: 1; opacity: 0.5;
    }
    .btn-edit-row:hover { opacity: 1; background: var(--surface2); }
    .empty { padding: 60px; text-align: center; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 16px; }
    .count { padding: 10px 16px; font-size: 13px; color: var(--text-muted); border-top: 1px solid var(--border); }
  `]
})
export class HomeComponent implements OnInit {
  allPersons: Person[] = [];
  allRelations: Relation[] = [];
  filtered: Person[] = [];
  selectedPerson: Person | null = null;
  showForm = false;
  editingPerson: Person | null = null;
  searchQuery = '';
  sortColumn: keyof Person = 'last_name';
  sortDir: 1 | -1 = 1;

  constructor(private api: ApiService, private router: Router, private cdr: ChangeDetectorRef, public theme: ThemeService) {}

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.api.getPersons().subscribe(p => {
      this.allPersons = p;
      if (this.selectedPerson) {
        this.selectedPerson = p.find(x => x.id === this.selectedPerson!.id) ?? null;
      }
      this.applyFilter();
      this.cdr.detectChanges();
    });
    this.api.getRelations().subscribe(r => {
      this.allRelations = r;
      this.cdr.detectChanges();
    });
  }

  onSearch(): void {
    this.applyFilter();
    this.cdr.detectChanges();
  }

  sortBy(col: keyof Person): void {
    if (this.sortColumn === col) {
      this.sortDir = this.sortDir === 1 ? -1 : 1;
    } else {
      this.sortColumn = col;
      this.sortDir = 1;
    }
    this.applyFilter();
    this.cdr.detectChanges();
  }

  sortIcon(col: keyof Person): string {
    if (this.sortColumn !== col) return '↕';
    return this.sortDir === 1 ? '↑' : '↓';
  }

  private applyFilter(): void {
    const q = this.searchQuery.toLowerCase().trim();
    let result = q
      ? this.allPersons.filter(p =>
          p.first_name.toLowerCase().includes(q) ||
          p.last_name.toLowerCase().includes(q)
        )
      : [...this.allPersons];

    result.sort((a, b) => {
      const av = (a[this.sortColumn] ?? '') as string;
      const bv = (b[this.sortColumn] ?? '') as string;
      return av.localeCompare(bv) * this.sortDir;
    });

    this.filtered = result;
  }

  openTree(person: Person): void {
    this.router.navigate(['/tree', person.id]);
  }

  openPanel(person: Person, event: MouseEvent): void {
    event.stopPropagation();
    this.api.getPerson(person.id).subscribe(p => {
      this.selectedPerson = p;
      this.cdr.detectChanges();
    });
  }

  openAddForm(): void {
    this.editingPerson = null;
    this.showForm = true;
  }

  openEditForm(id: string): void {
    this.api.getPerson(id).subscribe(p => {
      this.editingPerson = p;
      this.showForm = true;
      this.cdr.detectChanges();
    });
  }

  onDelete(id: string): void {
    if (!confirm('Сигурен ли си?')) return;
    this.api.deletePerson(id).subscribe(() => {
      this.selectedPerson = null;
      this.reload();
    });
  }

  onSave(event: { data: PersonCreate; file?: File; relations?: PersonFormRelation[] }): void {
    const afterSave = (id: string) => {
      const rels = event.relations ?? [];
      const createRelations = () => {
        if (rels.length === 0) { this.reload(); return; }
        let remaining = rels.length;
        const done = () => { if (--remaining === 0) this.reload(); };
        rels.forEach(rel => {
          const person_a_id = rel.direction === 'a_to_b' ? id : rel.otherId;
          const person_b_id = rel.direction === 'a_to_b' ? rel.otherId : id;
          this.api.createRelation({ person_a_id, person_b_id, relation_type: rel.relation_type }).subscribe({ next: done, error: done });
        });
      };
      if (event.file) {
        this.api.uploadPhoto(id, event.file).subscribe(createRelations);
      } else {
        createRelations();
      }
    };

    if (this.editingPerson) {
      this.api.updatePerson(this.editingPerson.id, event.data).subscribe(u => afterSave(u.id));
    } else {
      this.api.createPerson(event.data).subscribe(c => afterSave(c.id));
    }
    this.showForm = false;
    this.editingPerson = null;
  }

  exportBackup(): void {
    this.api.exportBackup().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `family-tree-backup-${dateStr}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        alert('Грешка при експортиране на данни: ' + (err.error?.detail || err.message));
      }
    });
  }

  importBackup(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const confirmMsg = 'ВНИМАНИЕ: Това ще изтрие всички текущи данни и снимки в базата данни и ще ги замени с тези от архива.\n\nСигурни ли сте, че искате да продължите?';
    if (!confirm(confirmMsg)) {
      input.value = '';
      return;
    }

    this.api.importBackup(file).subscribe({
      next: (res) => {
        alert(`Архивът е импортиран успешно!\n\nИмпортирани:\n- Хора: ${res.imported.persons}\n- Връзки: ${res.imported.relations}\n- Снимки: ${res.imported.person_photos}`);
        this.reload();
        input.value = '';
      },
      error: (err) => {
        alert('Грешка при импортиране на данни: ' + (err.error?.detail || err.message));
        input.value = '';
      }
    });
  }
}
