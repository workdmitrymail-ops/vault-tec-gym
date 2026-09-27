// VAULT-TEC GYM · тренировка: связка логики и хранилища
// Активная тренировка лежит в kv под ключом activeWorkout.
//
// Запись: действия (отметка подхода, кнопки) сохраняются сразу через saveActive.
// Ввод с клавиатуры сохраняется с задержкой через saveActiveSoon, чтобы не писать базу
// на каждый символ. Если страница закрывается или перезагружается раньше, чем прошла задержка,
// несохранённое состояние синхронно пишется черновиком в localStorage: IndexedDB асинхронна
// и может не успеть. При следующей загрузке черновик той же тренировки подхватывается.

import * as store from './store.js';
import { finishWorkout, dayKey } from './logic.js';

const TYPE_DELAY = 400;
const DRAFT_KEY = 'vtg:active-draft';

let pending = null;
let timer = null;

function writeDraft() {
  // Данные заменены в другой вкладке: черновик этой вкладки устарел и писать его нельзя
  if (!pending || store.isFrozen()) return;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(pending)); } catch { /* нет места или запрет */ }
}

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* нечего чистить */ }
}

function cancelPending() {
  clearTimeout(timer);
  timer = null;
  pending = null;
}

window.addEventListener('pagehide', () => { writeDraft(); flushActive(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { writeDraft(); flushActive(); }
});

export async function loadPlans() {
  const list = await store.getAll('plans');
  return Object.fromEntries(list.map((p) => [p.exId, p]));
}

export async function loadActive() {
  const stored = await store.get('activeWorkout');
  const draft = readDraft();
  clearDraft();
  if (draft && stored && draft.id === stored.id) {
    await store.set('activeWorkout', draft);
    return draft;
  }
  return stored;
}

// Сразу: действия пользователя
export async function saveActive(workout) {
  cancelPending();
  await store.set('activeWorkout', workout);
  clearDraft();
}

// С задержкой: ввод с клавиатуры
export function saveActiveSoon(workout) {
  pending = workout;
  clearTimeout(timer);
  timer = setTimeout(flushActive, TYPE_DELAY);
}

// Немедленно дописать отложенное: потеря фокуса полем, уход со страницы
export async function flushActive() {
  if (!pending) return;
  const workout = pending;
  cancelPending();
  await store.set('activeWorkout', workout);
  if (!pending) clearDraft();
}

// Начало тренировки. Первая тренировка открывает цикл: неделя считается от её даты.
export async function beginWorkout(workout) {
  const ops = [{ store: 'kv', key: 'activeWorkout', put: workout }];
  if (!(await store.get('cycle'))) {
    ops.push({ store: 'kv', key: 'cycle', put: { startedAt: dayKey(new Date(workout.startedAt)) } });
  }
  await store.batch(ops);
}

// Завершение: запись в историю, новые задания, снятие активной тренировки. Одной транзакцией.
export async function completeWorkout(workout) {
  cancelPending();
  clearDraft();
  const { record, plans } = finishWorkout(workout, await loadPlans(), new Date());
  await store.batch([
    { store: 'workouts', put: record },
    ...Object.values(plans).map((p) => ({ store: 'plans', put: p })),
    { store: 'kv', key: 'lastFinished', put: record.id },
    { store: 'kv', delete: 'activeWorkout' }
  ]);
  // Первая сохранённая тренировка: один раз просим браузер хранить данные постоянно. Без ожидания,
  // экран завершения не должен ждать ответа браузера
  store.requestPersistenceOnce().catch(() => {});
  return record;
}

// Отмена перенесённого веса на экране завершения. Отменяется, только пока задание
// на следующий раз всё ещё держит перенесённое значение: позже его могла поменять другая тренировка.
export async function undoTransfer(record, index) {
  const t = record.applied[index];
  const plan = await store.getRecord('plans', t.exId);
  if (!plan) return false;
  const current = t.type === 'work' ? plan.work : plan.warm?.[t.warmIndex]?.w;
  if (current !== t.to) return false;
  if (t.type === 'work') plan.work = t.from;
  else plan.warm[t.warmIndex].w = t.from;
  record.applied[index] = { ...t, undone: true };
  await store.batch([{ store: 'plans', put: plan }, { store: 'workouts', put: record }]);
  return true;
}

export function canUndoTransfer(plans, t) {
  const plan = plans[t.exId];
  if (!plan || t.undone) return false;
  const current = t.type === 'work' ? plan.work : plan.warm?.[t.warmIndex]?.w;
  return current === t.to;
}
