import assert from 'node:assert/strict';
import test from 'node:test';
import { FullscreenController } from '../js/fullscreen-controller.mjs';

function createBrowserMock(requestFullscreen) {
  const listeners = {};
  const document = {
    fullscreenEnabled: true,
    fullscreenElement: null,
    addEventListener(name, listener) {
      listeners[name] = listener;
    }
  };
  const element = { requestFullscreen };
  return { document, element, listeners };
}

test('requests fullscreen on the first player interaction, not on page load', async () => {
  let requests = 0;
  const browser = createBrowserMock(() => {
    requests += 1;
    browser.document.fullscreenElement = browser.element;
    return Promise.resolve();
  });
  const controller = new FullscreenController(browser.document, browser.element, assert.fail);

  controller.bindUserGestures();
  assert.equal(requests, 0);

  browser.listeners.pointerdown();
  await Promise.resolve();
  assert.equal(requests, 1);
  browser.listeners.keydown();
  assert.equal(requests, 1);
});

test('reports fullscreen failure and allows a later user-gesture retry', async () => {
  let requests = 0;
  const errors = [];
  const browser = createBrowserMock(() => {
    requests += 1;
    return requests === 1 ? Promise.reject(new Error('blocked')) : Promise.resolve();
  });
  const controller = new FullscreenController(browser.document, browser.element, (error) => errors.push(error));

  controller.request();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(errors[0].message, 'blocked');

  controller.request();
  await Promise.resolve();
  assert.equal(requests, 2);
});

test('reports fullscreen exit so the active game can lock', () => {
  const browser = createBrowserMock(() => Promise.resolve());
  const exits = [];
  const controller = new FullscreenController(browser.document, browser.element, assert.fail);
  controller.bindExitDetection(() => exits.push('exit'));

  browser.document.fullscreenElement = browser.element;
  browser.listeners.fullscreenchange();
  assert.deepEqual(exits, []);

  browser.document.fullscreenElement = null;
  browser.listeners.fullscreenchange();
  browser.listeners.fullscreenchange();
  assert.deepEqual(exits, ['exit']);
});
