import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { TreePageComponent } from './components/tree-page/tree-page.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'tree/:id', component: TreePageComponent },
  { path: '**', redirectTo: '' },
];
