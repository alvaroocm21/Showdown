import './ui/styles.css';
import { startApp } from './ui/app';
import { createStore } from './ui/store';

startApp(document.getElementById('app')!, createStore());
