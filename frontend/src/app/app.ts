import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingBarComponent } from './components/loading-bar/loading-bar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LoadingBarComponent],
  template: `
    <app-loading-bar></app-loading-bar>
    <router-outlet></router-outlet>
  `,
})
export class App {}
