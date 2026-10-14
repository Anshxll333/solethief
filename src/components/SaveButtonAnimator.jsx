import React, { useEffect } from 'react';

export default function SaveButtonAnimator() {
  useEffect(() => {
    const handleSaveInteraction = (e) => {
      // Find closest button, submit input, or interactive element
      const target = e.target.closest('button, [role="button"], input[type="submit"], .commerceButton, .adminPrimaryButton, a');
      if (!target) return;

      const text = (target.innerText || target.value || target.getAttribute('aria-label') || target.title || '').toLowerCase();
      const className = (target.className || '').toLowerCase();

      // Check if it's a save or publish button
      const isSave = text.includes('save') || className.includes('save') || text.includes('publish') || target.type === 'submit';

      if (isSave) {
        // Trigger pulse/scale animation class
        target.classList.add('save-button-animated');
        setTimeout(() => {
          target.classList.remove('save-button-animated');
        }, 650);

        // Create ripple effect
        const rect = target.getBoundingClientRect();
        const ripple = document.createElement('span');
        ripple.className = 'save-ripple-effect';

        const size = Math.max(rect.width, rect.height) * 2.5;
        ripple.style.width = `${size}px`;
        ripple.style.height = `${size}px`;

        const x = (e.clientX !== undefined && e.clientX !== 0) ? e.clientX - rect.left : rect.width / 2;
        const y = (e.clientY !== undefined && e.clientY !== 0) ? e.clientY - rect.top : rect.height / 2;

        ripple.style.left = `${x - size / 2}px`;
        ripple.style.top = `${y - size / 2}px`;

        const computedPosition = window.getComputedStyle(target).position;
        if (computedPosition === 'static' || !computedPosition) {
          target.style.position = 'relative';
        }
        target.style.overflow = 'hidden';

        target.appendChild(ripple);
        setTimeout(() => ripple.remove(), 700);

        // Create floating sparkle / success badge
        const badge = document.createElement('div');
        badge.className = 'save-floating-badge';
        badge.innerText = text.includes('publish') ? 'Published! ✨' : 'Saved! ✨';

        badge.style.left = `${Math.min(Math.max(10, x), rect.width - 50)}px`;
        badge.style.top = `${Math.max(-24, y - 32)}px`;
        target.appendChild(badge);
        setTimeout(() => badge.remove(), 750);
      }
    };

    document.addEventListener('click', handleSaveInteraction, true);
    document.addEventListener('touchstart', handleSaveInteraction, { passive: true, capture: true });

    return () => {
      document.removeEventListener('click', handleSaveInteraction, true);
      document.removeEventListener('touchstart', handleSaveInteraction, true);
    };
  }, []);

  return null;
}
