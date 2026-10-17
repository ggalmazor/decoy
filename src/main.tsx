import { render } from 'preact';
import './styles/base.css';
import { registerServiceWorker } from './sw-register';
import { App } from './ui/app';

render(<App />, document.getElementById('app')!);
registerServiceWorker();
