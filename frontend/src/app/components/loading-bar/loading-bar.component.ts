import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService } from '../../services/loading.service';

@Component({
  selector: 'app-loading-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (loading) {
      <div class="loading-bar">
        <div class="loading-progress"></div>
      </div>
    }
  `,
  styles: [`
    .loading-bar {
      position: fixed; top: 0; left: 0; right: 0;
      height: 3px; z-index: 9999; background: rgba(74, 144, 217, 0.2);
    }
    .loading-progress {
      height: 100%; background: #4A90D9;
      animation: loading 1.2s ease-in-out infinite;
    }
    @keyframes loading {
      0%   { width: 0%; margin-left: 0; }
      50%  { width: 60%; margin-left: 20%; }
      100% { width: 0%; margin-left: 100%; }
    }
  `]
})
export class LoadingBarComponent implements OnInit {
  loading = false;

  constructor(private loadingService: LoadingService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadingService.loading$.subscribe(v => {
      this.loading = v;
      this.cdr.detectChanges();
    });
  }
}
