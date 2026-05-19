import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _dark = false;
  readonly themeChanged$ = new Subject<void>();

  get isDark(): boolean {
    return this._dark;
  }

  constructor() {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark') {
      this._dark = true;
      document.body.classList.add('dark');
    }
  }

  toggle(): void {
    this._dark = !this._dark;
    if (this._dark) {
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    this.themeChanged$.next();
  }
}
