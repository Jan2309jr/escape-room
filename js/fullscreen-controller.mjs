export class FullscreenController {
  constructor(documentRef, element, onError) {
    this.document = documentRef;
    this.element = element;
    this.onError = onError;
    this.requestPending = false;
    this.gestureHandler = null;
  }

  bindUserGestures() {
    if (this.gestureHandler) return;
    this.gestureHandler = () => this.request();
    this.document.addEventListener('pointerdown', this.gestureHandler);
    this.document.addEventListener('keydown', this.gestureHandler);
  }

  unbindUserGestures() {
    if (!this.gestureHandler || typeof this.document.removeEventListener !== 'function') return;
    this.document.removeEventListener('pointerdown', this.gestureHandler);
    this.document.removeEventListener('keydown', this.gestureHandler);
    this.gestureHandler = null;
  }

  requestAfterUnlock() {
    this.bindUserGestures();
    this.request();
  }

  bindExitDetection(onExit) {
    let wasFullscreen = Boolean(this.document.fullscreenElement);
    this.document.addEventListener('fullscreenchange', () => {
      const isFullscreen = Boolean(this.document.fullscreenElement);
      if (isFullscreen) this.unbindUserGestures();
      if (wasFullscreen && !isFullscreen) onExit();
      wasFullscreen = isFullscreen;
    });
  }

  request() {
    if (this.document.fullscreenElement || this.requestPending) return;
    if (!this.document.fullscreenEnabled || typeof this.element.requestFullscreen !== 'function') {
      this.onError(new Error('This browser does not support fullscreen.'));
      return;
    }

    this.requestPending = true;
    let request;
    try {
      request = this.element.requestFullscreen();
    } catch (error) {
      this.requestPending = false;
      this.onError(error);
      return;
    }

    Promise.resolve(request)
      .then(() => {
        this.requestPending = false;
        if (this.document.fullscreenElement) this.unbindUserGestures();
      })
      .catch((error) => {
        this.requestPending = false;
        this.onError(error);
      });
  }
}
