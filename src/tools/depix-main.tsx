import { render } from 'preact';
import '../styles/base.css';
import '../styles/depix.css';
import { DepixApp } from './depix-app';

render(<DepixApp />, document.getElementById('app')!);
