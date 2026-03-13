import { describe, it, expect, beforeEach, vi } from 'vitest';
import FirstRunModal from '../../src/renderer/js/first-run.js';

describe('FirstRunModal', () => {
  beforeEach(() => {
    // Minimal DOM setup
    document.body.innerHTML = `
      <div id="first-run-overlay" class="first-run-overlay">
        <div class="first-run-modal">
          <div id="first-run-body"></div>
        </div>
      </div>
    `;

    // Mock storeAPI and windowAPI
    window.storeAPI = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
    };
    window.windowAPI = {
      close: vi.fn(),
    };
  });

  it('exports EULA and PRIVACY text', () => {
    expect(typeof FirstRunModal.EULA_TEXT).toBe('string');
    expect(FirstRunModal.EULA_TEXT.length).toBeGreaterThan(100);
    expect(typeof FirstRunModal.PRIVACY_TEXT).toBe('string');
    expect(FirstRunModal.PRIVACY_TEXT.length).toBeGreaterThan(100);
  });

  it('shows the overlay when run() is called', async () => {
    const modal = new FirstRunModal();
    const promise = modal.run();

    const overlay = document.getElementById('first-run-overlay');
    expect(overlay.classList.contains('visible')).toBe(true);

    // Verify step 1 renders with EULA content
    const body = document.getElementById('first-run-body');
    expect(body.textContent).toContain('License Agreement');
    expect(body.textContent).toContain('I Accept');
    expect(body.textContent).toContain('Quit');

    // Complete the flow to avoid hanging promise
    const acceptBtn = body.querySelector('.first-run-btn-primary');
    acceptBtn.click();

    // Step 2 should now show
    expect(body.textContent).toContain('Privacy Policy');

    const continueBtn = body.querySelector('.first-run-btn-primary');
    continueBtn.click();

    await promise;
    expect(window.storeAPI.set).toHaveBeenCalledWith('firstRunCompleted', true);
  });

  it('advances from step 1 to step 2', () => {
    const modal = new FirstRunModal();
    modal.run();

    const body = document.getElementById('first-run-body');
    const acceptBtn = body.querySelector('.first-run-btn-primary');
    acceptBtn.click();

    expect(body.textContent).toContain('Privacy Policy');
    expect(body.textContent).toContain('Continue');
    expect(body.textContent).toContain('Back');
  });

  it('back button returns to step 1', () => {
    const modal = new FirstRunModal();
    modal.run();

    const body = document.getElementById('first-run-body');

    // Go to step 2
    body.querySelector('.first-run-btn-primary').click();
    expect(body.textContent).toContain('Privacy Policy');

    // Go back
    body.querySelector('.first-run-btn-secondary').click();
    expect(body.textContent).toContain('License Agreement');
  });

  it('quit button calls windowAPI.close', () => {
    const modal = new FirstRunModal();
    modal.run();

    const body = document.getElementById('first-run-body');
    const quitBtn = body.querySelector('.first-run-btn-secondary');
    quitBtn.click();

    expect(window.windowAPI.close).toHaveBeenCalled();
  });
});
