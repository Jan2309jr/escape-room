export class FullscreenController {
  constructor(documentRef, element, onError) {
    this.document = documentRef;
    this.element = element;
    this.onError = onError;
    this.requestPending = false;
  }

  bindUserGestures() {
    this.document.addEventListener('pointerdown', () => this.request(), { once: true });
    this.document.addEventListener('keydown', () => this.request(), { once: true });
  }

  bindExitDetection(onExit) {
    let wasFullscreen = Boolean(this.document.fullscreenElement);
    this.document.addEventListener('fullscreenchange', () => {
      const isFullscreen = Boolean(this.document.fullscreenElement);
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
      .then(() => { this.requestPending = false; })
      .catch((error) => {
        this.requestPending = false;
        this.onError(error);
      });
  }
}
