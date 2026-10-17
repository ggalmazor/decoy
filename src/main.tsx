import { render } from 'preact';
import './styles/base.css';
import { App } from './ui/app';

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

export const VERSION = __DECOY_VERSION__;
