import assert from 'node:assert/strict';
import test from 'node:test';

test('players can solve the investigation from login through stopping the wipe', async (context) => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  };
  globalThis.window = { location: { search: '?team=GAME_FLOW_TEST' } };

  const { sound } = await import('../js/audio.js');
  sound.muted = true;
  const { gameState } = await import('../js/state.js');
  context.after(() => {
    clearInterval(gameState.timerInterval);
    clearInterval(gameState.pollInterval);
    delete globalThis.localStorage;
    delete globalThis.window;
  });

  assert.equal(gameState.submitLoginPassword('SWE-EPOCH-0000').success, false);
  assert.equal(gameState.submitLoginPassword('yayyougotthepassword').success, true);
  assert.equal(gameState.finalizeSuspect('02').success, true);
  assert.equal(gameState.finalizeSuspect('05').success, false, 'Divya requires the recovery code');

  gameState.markRecoveryCodeSolved();
  assert.equal(gameState.finalizeSuspect('05').success, true);
  assert.equal(gameState.isNettraceLocked(), false);
  gameState.markNettraceComplete();
  gameState.markCctvCamViewed('CAM01');
  assert.equal(gameState.canFinalizeThirdSlot(), false, 'both camera feeds are required');
  gameState.markCctvCamViewed('CAM02');
  assert.equal(gameState.finalizeSuspect('01').success, true);
  assert.equal(gameState.isFinalStageLocked(), false);

  const accusation = gameState.submitFinalAccusation(
    'K. Verma',
    '1) Grant funds went to NULLDEPT. 2) The car was in Slot B-14. 3) WS-14 traces connect the wipe to the incident.'
  );
  assert.equal(accusation.success, true);
  assert.equal(gameState.data.fragments[4], 'NULLDEPT');
  assert.equal(gameState.submitRamPcLogin('ramsharma@epoch', 'ramsharma123').success, true);
  assert.equal(gameState.stopDataWipe().success, true);
  assert.equal(gameState.data.currentLevel, 6);
  assert.equal(gameState.data.wipeStopped, true);
});
