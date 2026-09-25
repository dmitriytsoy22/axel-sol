/** How long the load reveal may hold content back before the page shows it as is. */
export const REVEAL_WINDOW_MS = 1500;

/*
 * Inline script for <body>: the one switch for the CSS load reveal (`.reveal` in
 * styles/globals.css). The reveal may delay content but must never withhold it. The flag
 * goes up only while the document is actually painting: a hidden tab or an offscreen
 * WKWebView suspends animation timelines, which is how framer-motion's useInView reveals
 * end up frozen at opacity 0. The flag comes down once the reveal window has passed, so
 * even a stalled animation releases the content.
 */
export const REVEAL_GATE_SCRIPT =
  '(function(){if(document.visibilityState!=="visible")return;' +
  'var r=document.documentElement;r.dataset.reveal="1";' +
  `setTimeout(function(){delete r.dataset.reveal},${REVEAL_WINDOW_MS})})()`;
