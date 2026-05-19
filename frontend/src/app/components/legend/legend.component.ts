import { Component } from '@angular/core';

@Component({
  selector: 'app-legend',
  standalone: true,
  template: `
    <div class="legend">
      <div class="item">
        <span class="line parent-child"></span>
        <span>Родител / Дете</span>
      </div>
      <div class="item">
        <span class="line spouse"></span>
        <span>Съпруг / Съпруга</span>
      </div>
      <div class="item">
        <span class="line sibling"></span>
        <span>Брат / Сестра</span>
      </div>
    </div>
  `,
  styles: [`
    .legend {
      position: absolute; bottom: 20px; right: 20px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px; padding: 12px 16px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.1);
      display: flex; flex-direction: column; gap: 8px;
      z-index: 50; font-size: 13px; color: var(--text);
    }
    .item { display: flex; align-items: center; gap: 10px; }
    .line {
      display: inline-block; width: 32px; height: 3px; border-radius: 2px;
    }
    .parent-child { background: #4A90D9; }
    .spouse { background: #E05C5C; border-top: 3px dashed #E05C5C; height: 0; }
    .sibling { background: none; border-top: 3px dashed #4CAF50; height: 0; width: 32px; }
  `]
})
export class LegendComponent {}
