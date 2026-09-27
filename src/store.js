// VAULT-TEC GYM · хранение
// Основное хранилище IndexedDB. Мелкие ключи дополнительно зеркалятся в localStorage:
// их можно прочитать синхронно до открытия базы, и они восстанавливают базу,
// если система её очистила, а localStorage уцелел.
//
// Версия схемы одна на всё: она же версия базы IndexedDB и версия файла копии.
// При изменении схемы:
//   1. поднять SCHEMA_VERSION;
//   2. дописать шаг в DB_MIGRATIONS: он получает транзакцию обновления базы;
//   3. дописать шаг в FILE_MIGRATIONS: он переводит файл копии прошлой версии в новую,
//      чтобы старые копии восстанавливались.
// Шаги выполняются по порядку от версии данных до текущей. Данные не удаляются молча.

export const SCHEMA_VERSION = 1;

// Версия приложения: экран настроек и имя кэша service worker vtg-shell-<версия>.
// Поднимать при любом изменении файлов приложения и одновременно менять VERSION в sw.js на то же значение,
// tools/logic_test.html сверяет их. Иначе установленное приложение продолжит брать файлы из прежнего кэша
// и изменений не увидит. Новая версия ставит новый кэш, старый удаляется при следующем запуске.
export const APP_VERSION = '2.0.0';

const APP_ID = 'vault-tec-gym';
const DB_NAME = 'vault-tec-gym';
const LS_PREFIX = 'vtg:';

// Хранилища базы, устройство каждого задано в DB_MIGRATIONS.
//   kv          настройки, цикл, активная тренировка, служебное; ключ передаётся явно
//   exercises   упражнения, созданные пользователем, ключ id
//   program     дни программы с правками пользователя, ключ id
//   plans       задание на следующий раз по упражнению, ключ exId
//   workouts    завершённые тренировки, ключ id, индекс по дате начала
//   bodyweight  вес тела, ключ date
export const STORES = ['kv', 'exercises', 'program', 'plans', 'workouts', 'bodyweight'];

// Ключи kv, которые зеркалятся в localStorage. Только мелкие значения.
const MIRROR_KEYS = new Set(['settings', 'cycle', 'lastBackup']);

// Служебные ключи kv, которые описывают это устройство, а не данные тренировок:
// в резервную копию не попадают, при восстановлении из копии остаются прежними.
//   storage   итог запроса постоянного хранилища, см. requestPersistenceOnce
const DEVICE_KEYS = new Set(['storage']);

const DB_MIGRATIONS = {
  // Версия 1: создание хранилищ.
  1(db) {
    db.createObjectStore('kv');
    db.createObjectStore('exercises', { keyPath: 'id' });
    db.createObjectStore('program', { keyPath: 'id' });
    db.createObjectStore('plans', { keyPath: 'exId' });
    const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
    workouts.createIndex('byStart', 'startedAt');
    db.createObjectStore('bodyweight', { keyPath: 'date' });
  }
};

const FILE_MIGRATIONS = {
  // Пример на будущее:
  // 2(data) { data.stores.plans.forEach(p => { p.extra ??= 0; }); return data; }
};

let dbPromise = null;

// ---- Заморозка записи ----
// Другая вкладка удалила данные, загрузила копию или начала новый цикл (src/sync.js).
// Эта вкладка держит в памяти прежнее состояние и перезагружается; до перезагрузки
// и во время неё ни одна запись не должна дойти до базы и зеркала, иначе старое вернётся.
let frozen = false;

export function freeze() {
  frozen = true;
}

export function isFrozen() {
  return frozen;
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Транзакция прервана'));
  });
}

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      for (let v = event.oldVersion + 1; v <= SCHEMA_VERSION; v++) {
        DB_MIGRATIONS[v]?.(db, tx);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Другая вкладка обновила схему: закрыть базу, чтобы не блокировать обновление.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Обновление базы заблокировано другой вкладкой'));
  }).then(async (db) => {
    await restoreFromMirror(db);
    return db;
  });
  return dbPromise;
}

// Просьба к браузеру не удалять данные при нехватке места.
// Один раз, после первой сохранённой тренировки, а не при загрузке: к этому моменту есть что беречь,
// и браузеры охотнее соглашаются для сайта, которым пользуются. Итог пишется в служебный ключ storage
// и показывается в настройках. Повторно не спрашивает, пока ключ есть; сброс данных удаляет и его.
export async function requestPersistenceOnce() {
  if (frozen || (await get('storage'))) return null;
  let result;
  if (!navigator.storage?.persist) {
    result = { supported: false, persisted: false };
  } else {
    let persisted = false;
    try { persisted = await navigator.storage.persist(); } catch { persisted = false; }
    result = { supported: true, persisted };
  }
  result.askedAt = new Date().toISOString();
  await set('storage', result);
  return result;
}

// ---- Зеркало в localStorage ----

function mirrorWrite(key, value) {
  if (frozen || !MIRROR_KEYS.has(key)) return;
  try {
    if (value === undefined) localStorage.removeItem(LS_PREFIX + key);
    else localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    // Переполнение или запрет хранилища: основное хранилище всё равно IndexedDB.
  }
}

// Синхронное чтение мелкого ключа до открытия базы.
export function peek(key) {
  if (!MIRROR_KEYS.has(key)) return undefined;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function restoreFromMirror(db) {
  if (frozen) return;
  const tx = db.transaction('kv', 'readwrite');
  const kv = tx.objectStore('kv');
  for (const key of MIRROR_KEYS) {
    const mirrored = peek(key);
    if (mirrored === undefined) continue;
    const stored = await request(kv.get(key));
    if (stored === undefined) kv.put(mirrored, key);
  }
  await done(tx);
}

// ---- Ключ и значение ----

export async function get(key) {
  const db = await open();
  return request(db.transaction('kv').objectStore('kv').get(key));
}

export async function set(key, value) {
  if (frozen) return;
  const db = await open();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(value, key);
  await done(tx);
  mirrorWrite(key, value);
}

export async function remove(key) {
  if (frozen) return;
  const db = await open();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').delete(key);
  await done(tx);
  mirrorWrite(key, undefined);
}

// ---- Записи в хранилищах ----

export async function getRecord(store, id) {
  const db = await open();
  return request(db.transaction(store).objectStore(store).get(id));
}

export async function getAll(store) {
  const db = await open();
  return request(db.transaction(store).objectStore(store).getAll());
}

export async function putRecord(store, record) {
  if (frozen) return;
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(record);
  await done(tx);
}

export async function deleteRecord(store, id) {
  if (frozen) return;
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  await done(tx);
}

// Несколько записей одной транзакцией: либо все, либо ни одной.
// ops: [{ store, put: запись }, { store: 'kv', key, put: значение }, { store, delete: ключ }]
export async function batch(ops) {
  if (frozen) return;
  const db = await open();
  const names = [...new Set(ops.map((op) => op.store))];
  const tx = db.transaction(names, 'readwrite');
  for (const op of ops) {
    const store = tx.objectStore(op.store);
    if ('delete' in op) store.delete(op.delete);
    else if (op.store === 'kv') store.put(op.put, op.key);
    else store.put(op.put);
  }
  await done(tx);
  for (const op of ops) {
    if (op.store !== 'kv') continue;
    if ('delete' in op) mirrorWrite(op.delete, undefined);
    else mirrorWrite(op.key, op.put);
  }
}

// ---- Резервная копия ----

export async function exportData() {
  const db = await open();
  const names = STORES;
  const tx = db.transaction(names);
  const stores = {};
  for (const name of names) {
    const store = tx.objectStore(name);
    if (name === 'kv') {
      const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
      stores.kv = keys.map((k, i) => [k, values[i]]).filter(([k]) => !DEVICE_KEYS.has(k));
    } else {
      stores[name] = await request(store.getAll());
    }
  }
  return { app: APP_ID, schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), stores };
}

function backupFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `vault-tec-gym-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

// Файл копии, собранный заранее. Safari на iOS открывает меню «Поделиться» только
// сразу в ответ на нажатие, без ожидания базы, поэтому экран готовит файл при открытии.
export async function prepareBackup() {
  const data = await exportData();
  const name = backupFileName();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  return { name, blob, file, exportedAt: data.exportedAt };
}

// Сохранение файла через стандартное меню системы. Вызывать из обработчика нажатия.
// Возвращает true, если файл отдан системе, false, если пользователь отменил.
export async function saveBackup(prepared) {
  const { name, blob, file, exportedAt } = prepared ?? await prepareBackup();

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
    } catch (err) {
      if (err.name === 'AbortError') return false;
      throw err;
    }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url));
  }
  await set('lastBackup', exportedAt);
  return true;
}

function validate(data) {
  if (!data || typeof data !== 'object' || data.app !== APP_ID) {
    throw new Error('Это не резервная копия VAULT-TEC GYM');
  }
  if (!Number.isInteger(data.schema) || data.schema < 1) {
    throw new Error('В копии нет версии схемы');
  }
  if (data.schema > SCHEMA_VERSION) {
    throw new Error('Копия сделана более новой версией приложения, обновите приложение');
  }
  if (!data.stores || typeof data.stores !== 'object') {
    throw new Error('В копии нет данных');
  }
}

function migrateFile(data) {
  for (let v = data.schema + 1; v <= SCHEMA_VERSION; v++) {
    data = FILE_MIGRATIONS[v]?.(data) ?? data;
    data.schema = v;
  }
  return data;
}

// Полная замена данных содержимым копии, одной транзакцией: либо всё, либо ничего.
export async function importData(input) {
  validate(input);
  const data = migrateFile(structuredClone(input));
  for (const name of STORES) {
    if (data.stores[name] !== undefined && !Array.isArray(data.stores[name])) {
      throw new Error(`Повреждён раздел копии: ${name}`);
    }
  }
  if (frozen) return;
  const db = await open();
  const names = STORES;
  // Служебные ключи устройства переживают восстановление: копия могла быть сделана на другом телефоне
  const device = await Promise.all([...DEVICE_KEYS].map(async (k) => [k, await get(k)]));
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    const store = tx.objectStore(name);
    store.clear();
    for (const item of data.stores[name] ?? []) {
      if (name === 'kv' && DEVICE_KEYS.has(item[0])) continue;
      if (name === 'kv') store.put(item[1], item[0]);
      else store.put(item);
    }
    if (name === 'kv') device.forEach(([k, v]) => { if (v !== undefined) store.put(v, k); });
  }
  await done(tx);

  for (const key of MIRROR_KEYS) mirrorWrite(key, undefined);
  for (const [key, value] of data.stores.kv ?? []) mirrorWrite(key, value);
}

export async function importFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Файл не читается как резервная копия');
  }
  await importData(data);
}

// Сброс данных: база и зеркало. Служебный ключ storage тоже удаляется:
// после сброса запрос постоянного хранилища повторится после первой тренировки.
export async function clearAll() {
  if (frozen) return;
  const db = await open();
  const names = STORES;
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) tx.objectStore(name).clear();
  await done(tx);
  for (const key of MIRROR_KEYS) mirrorWrite(key, undefined);
}
