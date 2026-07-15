import './style.css';
import { registerAll, loadInitial } from './store';
import { initEditor } from './editor';
import { initChrome, bootToast } from './chrome';
import { initJack } from './jack';
import { initExtras } from './extras';
import { initTests } from './tests';
import { initMobile } from './mobile';

if (matchMedia('(max-width: 900px)').matches) {
  // Read-mode + mobile restyle. Deliberately skip loadInitial() so a desktop
  // remix link (#s=) or saved edits never scramble the clean phone layout.
  initMobile();
} else {
  registerAll();
  const source = loadInitial();
  initEditor();
  initChrome();
  bootToast(source);
  initJack();
  initExtras();
  initTests();
}
