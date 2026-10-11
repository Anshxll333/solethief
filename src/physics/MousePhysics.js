import Matter from 'matter-js';

export function createMouseInteraction(engine, shoeBodies, interactionArea, hoverSound = null) {
  let mouseX = -9999;
  let mouseY = -9999;
  let isPointerActive = false;
  let cachedRect = null;
  let currentCursor = 'default';

  const updateRect = () => {
    cachedRect = interactionArea.getBoundingClientRect();
  };

  updateRect();
  window.addEventListener('resize', updateRect, { passive: true });
  window.addEventListener('scroll', updateRect, { passive: true });

  const handlePointerMove = (e) => {
    // Skip touch events
    if (e.pointerType === 'touch') return;
    if (!cachedRect) updateRect();

    mouseX = e.clientX - cachedRect.left;
    mouseY = e.clientY - cachedRect.top;
    isPointerActive = true;
  };

  const handlePointerLeave = () => {
    isPointerActive = false;
    mouseX = -9999;
    mouseY = -9999;
    shoeBodies.forEach(shoeBody => {
      shoeBody.playedSound = false;
    });
    if (currentCursor !== 'default') {
      currentCursor = 'default';
      interactionArea.style.cursor = 'default';
    }
  };

  const interactionRadius = 350;
  const clickRadius = 140;
  const maxForce = 0.04;

  // Run repulsion synced with the Matter.js physics tick, avoiding high-polling mouse flooding
  const applyPhysicsForces = () => {
    if (!isPointerActive) return;

    let isOverAnyShoe = false;

    for (let i = 0; i < shoeBodies.length; i++) {
      const shoeBody = shoeBodies[i];
      const bodyPos = shoeBody.position;

      const dx = bodyPos.x - mouseX;
      const dy = bodyPos.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < clickRadius) {
        isOverAnyShoe = true;
      }

      if (dist < interactionRadius && dist > 0) {
        if (hoverSound && !shoeBody.playedSound) {
          hoverSound.currentTime = 0;
          hoverSound.play().catch(() => { });
          shoeBody.playedSound = true;
        }

        const forceFactor = (interactionRadius - dist) / interactionRadius;
        const forceMagnitude = forceFactor * maxForce;

        Matter.Body.applyForce(shoeBody, {
          x: bodyPos.x + (Math.random() * 10 - 5),
          y: bodyPos.y + (Math.random() * 10 - 5)
        }, {
          x: (dx / dist) * forceMagnitude,
          y: (dy / dist) * forceMagnitude
        });
      } else {
        shoeBody.playedSound = false;
      }
    }

    const nextCursor = isOverAnyShoe ? 'pointer' : 'default';
    if (nextCursor !== currentCursor) {
      currentCursor = nextCursor;
      interactionArea.style.cursor = nextCursor;
    }
  };

  interactionArea.addEventListener('pointermove', handlePointerMove, { passive: true });
  interactionArea.addEventListener('pointerleave', handlePointerLeave, { passive: true });
  Matter.Events.on(engine, 'beforeUpdate', applyPhysicsForces);

  return function destroyMouseInteraction() {
    Matter.Events.off(engine, 'beforeUpdate', applyPhysicsForces);
    interactionArea.removeEventListener('pointermove', handlePointerMove);
    interactionArea.removeEventListener('pointerleave', handlePointerLeave);
    window.removeEventListener('resize', updateRect);
    window.removeEventListener('scroll', updateRect);
    interactionArea.style.cursor = '';
  };
}
