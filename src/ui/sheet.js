// VAULT-TEC GYM · нижний лист на <dialog>
// Модальный диалог даёт ловушку фокуса и закрытие клавишей Esc без своего кода.
// actions: [{ label, primary, danger, onClick }]. onClick получает close; если вернул false, лист не закрывается.

import { h } from './dom.js';

let counter = 0;

// titleClass: оформление заголовка, например подпись раздела для листа отдыха
export function openSheet({ title, titleClass = '', content = [], actions = [], dismissible = true, onDismiss }) {
  const titleId = `sheet-title-${++counter}`;
  let dialog;
  const close = () => { if (dialog.open) dialog.close(); };

  const buttons = actions.map((a) =>
    h('button', {
      class: `btn ${a.danger ? 'btn-danger' : a.primary ? 'btn-primary' : 'btn-second'}`,
      type: 'button',
      disabled: a.disabled,
      text: a.label,
      onclick: async () => {
        const keep = await a.onClick?.(close);
        if (keep !== false) close();
      }
    }));

  dialog = h('dialog', { class: 'sheet', 'aria-labelledby': titleId },
    h('div', { class: 'sheet__body' },
      h('h2', { class: `sheet__title ${titleClass}`.trim(), id: titleId, text: title }),
      content),
    buttons.length ? h('div', { class: 'sheet__actions' }, buttons) : null);

  dialog.addEventListener('cancel', (e) => {
    if (!dismissible) e.preventDefault();
    else onDismiss?.();
  });
  // Нажатие по затемнению вокруг листа закрывает его, если это разрешено
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog && dismissible) { onDismiss?.(); close(); }
  });
  dialog.addEventListener('close', () => dialog.remove());

  document.body.append(dialog);
  dialog.showModal();
  return { close, el: dialog };
}
