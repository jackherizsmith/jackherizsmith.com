import './style.css';
import { registerAll, loadInitial } from './store';
import { initEditor } from './editor';
import { initChrome, bootToast } from './chrome';
import { initJack } from './jack';
import { initExtras } from './extras';
import { initTests } from './tests';

registerAll();
const source = loadInitial();

if (!matchMedia('(max-width: 900px)').matches) {
  initEditor();
  initChrome();
  bootToast(source);
  initJack();
  initExtras();
  initTests();
}
