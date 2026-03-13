const EULA_TEXT = `End User License Agreement

This software is provided under the MIT License. By using TermWatch, you agree to the following:

1. AS-IS SOFTWARE — TermWatch is provided "as is" without warranty of any kind, express or implied.

2. NO DRM CIRCUMVENTION — TermWatch does not bypass, circumvent, or interfere with digital rights management protections. You agree not to modify TermWatch to do so.

3. STREAMING SERVICE COMPLIANCE — You are solely responsible for complying with the Terms of Service of any streaming service you access through TermWatch. Some services may consider overlay tools or modified user agents a violation of their ToS.

4. VALID SUBSCRIPTIONS REQUIRED — A valid subscription to any streaming service you access is required.

5. LIMITATION OF LIABILITY — The authors shall not be liable for any claim, damages, or other liability arising from the use of this software.

See the full MIT License for complete terms.`;

const PRIVACY_TEXT = `Privacy Policy

TermWatch respects your privacy. Here is what you need to know:

1. NO TELEMETRY — TermWatch does not collect, transmit, or store any usage data, analytics, or telemetry.

2. NO DATA COLLECTION — We do not collect personal information, browsing history, or any other user data.

3. LOCAL STORAGE ONLY — All settings, bookmarks, and preferences are stored locally on your machine using Electron's built-in storage. Nothing is sent to external servers.

4. UPDATE CHECKS — When checking for updates, TermWatch contacts the GitHub Releases API to see if a newer version is available. No personal data is sent in this request.

5. STREAMING CONTENT — Video content is loaded directly from streaming services in an embedded browser view. TermWatch does not proxy, record, or intercept this content.`;

class FirstRunModal {
  constructor() {
    this._overlay = document.getElementById('first-run-overlay');
  }

  /**
   * Show the first-run modal and return a promise that resolves when complete.
   * @returns {Promise<void>}
   */
  run() {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this._renderStep1();
      this._overlay.classList.add('visible');
    });
  }

  _renderStep1() {
    const body = document.getElementById('first-run-body');
    body.innerHTML = '';

    const steps = this._createStepIndicator(1);
    body.appendChild(steps);

    const heading = document.createElement('h3');
    heading.className = 'first-run-heading';
    heading.textContent = 'License Agreement';
    body.appendChild(heading);

    const textArea = document.createElement('div');
    textArea.className = 'first-run-legal-text';
    textArea.textContent = EULA_TEXT;
    body.appendChild(textArea);

    const actions = document.createElement('div');
    actions.className = 'first-run-actions';

    const quitBtn = document.createElement('button');
    quitBtn.className = 'first-run-btn first-run-btn-secondary';
    quitBtn.textContent = 'Quit';
    quitBtn.addEventListener('click', () => {
      window.windowAPI.close();
    });

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'first-run-btn first-run-btn-primary';
    acceptBtn.textContent = 'I Accept';
    acceptBtn.addEventListener('click', () => {
      this._renderStep2();
    });

    actions.appendChild(quitBtn);
    actions.appendChild(acceptBtn);
    body.appendChild(actions);
  }

  _renderStep2() {
    const body = document.getElementById('first-run-body');
    body.innerHTML = '';

    const steps = this._createStepIndicator(2);
    body.appendChild(steps);

    const heading = document.createElement('h3');
    heading.className = 'first-run-heading';
    heading.textContent = 'Privacy Policy';
    body.appendChild(heading);

    const textArea = document.createElement('div');
    textArea.className = 'first-run-legal-text';
    textArea.textContent = PRIVACY_TEXT;
    body.appendChild(textArea);

    const actions = document.createElement('div');
    actions.className = 'first-run-actions';

    const backBtn = document.createElement('button');
    backBtn.className = 'first-run-btn first-run-btn-secondary';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', () => {
      this._renderStep1();
    });

    const continueBtn = document.createElement('button');
    continueBtn.className = 'first-run-btn first-run-btn-primary';
    continueBtn.textContent = 'Continue';
    continueBtn.addEventListener('click', () => {
      this._complete();
    });

    actions.appendChild(backBtn);
    actions.appendChild(continueBtn);
    body.appendChild(actions);
  }

  _createStepIndicator(activeStep) {
    const container = document.createElement('div');
    container.className = 'first-run-steps';

    for (let i = 1; i <= 2; i++) {
      const dot = document.createElement('span');
      dot.className = 'first-run-step' + (i === activeStep ? ' active' : '');
      dot.textContent = i;
      container.appendChild(dot);

      if (i < 2) {
        const line = document.createElement('span');
        line.className = 'first-run-step-line';
        container.appendChild(line);
      }
    }

    return container;
  }

  _complete() {
    window.storeAPI.set('firstRunCompleted', true);
    this._overlay.classList.remove('visible');
    if (this._resolve) {
      this._resolve();
      this._resolve = null;
    }
  }
}

// Export for testing
FirstRunModal.EULA_TEXT = EULA_TEXT;
FirstRunModal.PRIVACY_TEXT = PRIVACY_TEXT;

module.exports = FirstRunModal;
