import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => console.log('Angular bootstrapped successfully'))
  .catch((err) => {
    console.error('Bootstrap error:', err);
    document.querySelector('app-root')!.innerHTML =
      `<pre style="color:red;padding:20px">${err}</pre>`;
  });
