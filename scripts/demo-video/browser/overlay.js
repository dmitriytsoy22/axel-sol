/*
 * Runs in every page of the recording (context.addInitScript). A headless browser draws no
 * pointer, so this draws one that follows Playwright's mouse, with a pulse on each click. It also
 * frames the part of the page a caption talks about, and scrolls with an easing curve.
 *
 * Plain JavaScript on purpose: functions that tsx compiled and Playwright then serializes can
 * call esbuild helpers the page doesn't have.
 */
(() => {
  if (window.top !== window || window.__demo) return;

  const CURSOR_KEY = 'axel-demo-video:cursor';
  const CSS = `
    nextjs-portal { display: none !important; }
    html { scroll-behavior: auto !important; scrollbar-width: none; }
    html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; }
    #demo-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none;
      will-change: transform; }
    #demo-cursor .halo { position: absolute; left: -24px; top: -24px; width: 48px; height: 48px;
      border-radius: 50%; background: rgba(6, 182, 212, 0.2); border: 2px solid rgba(6, 182, 212, 0.6);
      transition: transform 160ms ease-out, background-color 160ms ease-out; }
    #demo-cursor.down .halo { transform: scale(0.72); background: rgba(6, 182, 212, 0.42); }
    #demo-cursor svg { position: absolute; left: -4px; top: -3px; width: 30px; height: 30px;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); }
    .demo-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 18px;
      height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; border: 3px solid #06b6d4;
      animation: demo-ripple 650ms ease-out forwards; }
    @keyframes demo-ripple { to { transform: scale(4.5); opacity: 0; } }
    .demo-frame { position: absolute; z-index: 2147483645; pointer-events: none;
      border: 3px solid #06b6d4; border-radius: 14px; box-shadow: 0 0 0 7px rgba(6, 182, 212, 0.16);
      opacity: 0; transition: opacity 280ms ease-out; }
    .demo-frame.on { opacity: 1; }
  `;
  const ARROW =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2.5v17.2l4.6-4.3 2.9 6.6 3-1.3-2.9-6.5 6.3-.3z" fill="#fff" stroke="#081014" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  let position = { x: -100, y: -100 };
  try {
    position = JSON.parse(sessionStorage.getItem(CURSOR_KEY)) || position;
  } catch {
    // No stored position yet: the pointer appears with the first mouse move.
  }

  let cursor = null;
  const place = () => {
    if (cursor) cursor.style.transform = `translate(${position.x}px, ${position.y}px)`;
  };

  // Added after the app hydrated: nodes React didn't render must not be in the DOM it hydrates.
  const install = () => {
    if (!document.body) return;
    if (!document.getElementById('demo-overlay-style')) {
      const style = document.createElement('style');
      style.id = 'demo-overlay-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    if (!cursor || !cursor.isConnected) {
      cursor = document.createElement('div');
      cursor.id = 'demo-cursor';
      cursor.innerHTML = `<div class="halo"></div>${ARROW}`;
      document.body.appendChild(cursor);
      place();
    }
  };

  window.addEventListener('load', () => setTimeout(install, 300));
  window.addEventListener(
    'mousemove',
    (event) => {
      position = { x: event.clientX, y: event.clientY };
      sessionStorage.setItem(CURSOR_KEY, JSON.stringify(position));
      install();
      place();
    },
    true,
  );
  window.addEventListener(
    'mousedown',
    (event) => {
      install();
      cursor.classList.add('down');
      const ripple = document.createElement('div');
      ripple.className = 'demo-ripple';
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    },
    true,
  );
  window.addEventListener('mouseup', () => cursor && cursor.classList.remove('down'), true);

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  window.__demo = {
    install,

    /** Scrolls the window to `top` over `ms` milliseconds; resolves with where it stopped. */
    scrollTo(top, ms) {
      const start = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const target = Math.max(0, Math.min(top, max));
      const distance = target - start;
      if (Math.abs(distance) < 2) return Promise.resolve(target);
      return new Promise((resolve) => {
        const began = performance.now();
        const step = (now) => {
          const progress = Math.min(1, (now - began) / ms);
          window.scrollTo(0, start + distance * ease(progress));
          if (progress < 1) requestAnimationFrame(step);
          else resolve(target);
        };
        requestAnimationFrame(step);
      });
    },

    /**
     * Frames a box given in viewport coordinates. The frame scrolls with the page, unless it
     * frames something `fixed`, such as a dialog.
     */
    frame(x, y, width, height, fixed) {
      install();
      const pad = 10;
      const frame = document.createElement('div');
      frame.className = 'demo-frame';
      frame.style.position = fixed ? 'fixed' : 'absolute';
      frame.style.left = `${x + (fixed ? 0 : window.scrollX) - pad}px`;
      frame.style.top = `${y + (fixed ? 0 : window.scrollY) - pad}px`;
      frame.style.width = `${width + 2 * pad}px`;
      frame.style.height = `${height + 2 * pad}px`;
      document.body.appendChild(frame);
      requestAnimationFrame(() => frame.classList.add('on'));
    },

    clearFrames() {
      for (const frame of document.querySelectorAll('.demo-frame')) {
        frame.classList.remove('on');
        setTimeout(() => frame.remove(), 300);
      }
    },
  };
})();
