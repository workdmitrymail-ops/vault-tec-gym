// VAULT-TEC GYM · оповещение других вкладок о замене данных
// Удаление всех данных, загрузка резервной копии и новый цикл меняют данные целиком.
// Другая открытая вкладка держит в памяти прежнее состояние, например идущую тренировку,
// и записала бы его обратно: по окончании отдыха, при вводе с задержкой или при уходе со страницы.
// Получив оповещение, вкладка замораживает запись и перезагружается на главный экран (src/app.js).
//
// Оповещение отправляется после того, как операция полностью записана: иначе перезагрузившаяся
// вкладка могла бы прочитать базу на середине и восстановить старое из зеркала в localStorage.
// Отправившая вкладка своё оповещение не получает, так устроен BroadcastChannel.

const CHANNEL = 'vault-tec-gym';

export const REASON = { wipe: 'wipe', import: 'import', cycle: 'cycle' };

// Имя канала задаётся для проверок: tools/logic_test.html не должен задевать открытое приложение
export function createSync(name = CHANNEL) {
  let channel;
  const get = () => {
    if (channel === undefined) channel = 'BroadcastChannel' in self ? new BroadcastChannel(name) : null;
    return channel;
  };
  return {
    announce(reason) {
      get()?.postMessage({ type: 'data-replaced', reason });
    },
    onDataReplaced(handler) {
      const ch = get();
      if (!ch) return () => {};
      const listener = (event) => { if (event.data?.type === 'data-replaced') handler(event.data.reason); };
      ch.addEventListener('message', listener);
      return () => ch.removeEventListener('message', listener);
    },
    close() {
      channel?.close();
      channel = null;
    }
  };
}

const shared = createSync();
export const announce = (reason) => shared.announce(reason);
export const onDataReplaced = (handler) => shared.onDataReplaced(handler);
