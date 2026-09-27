// VAULT-TEC GYM · пустое состояние, артборд 17: иллюстрация в белой рамке, заголовок,
// короткое пояснение и, если есть, действие

import { h } from './dom.js';

export function emptyState(text, action = null, title = 'Пока нет данных') {
  return h('section', { class: 'empty' },
    h('div', { class: 'slot slot--hero' }, h('img', { class: 'slot__img', src: 'assets/mascot/empty.png', alt: '' })),
    h('h2', { class: 'empty__title', text: title }),
    h('p', { class: 'empty__text', text }),
    action ? h(action.href ? 'a' : 'button', {
      class: 'btn btn-primary btn-link btn-block', href: action.href, type: action.href ? null : 'button',
      onclick: action.onClick, text: action.label
    }) : null);
}
