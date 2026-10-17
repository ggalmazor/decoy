import { render } from 'preact';
import '../styles/base.css';
import '../styles/depix.css';
import { registerServiceWorker } from '../sw-register';
import { DepixApp } from './depix-app';

render(<DepixApp />, document.getElementById('app')!);
registerServiceWorker();
