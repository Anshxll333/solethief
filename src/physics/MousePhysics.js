import Matter from 'matter-js';

export function createMouseInteraction(shoeBodies, interactionArea, hoverSound = null) {
  const handleMouseMove = (e) => {
    // Skip on touch devices to keep mobile simple
    if (e.pointerType === 'touch') return;

    const rect = interactionArea.getBoundingClientRect();
    const pageX = e.clientX - rect.left;
    const pageY = e.clientY - rect.top;
    const interactionRadius = 350; // Interaction range for physical repulsion
    const clickRadius = 140; // Range for considering the shoe "hovered" mathematically
    const maxForce = 0.04;
    
    let isOverAnyShoe = false;

    // Loop through ALL shoe bodies and apply force if within radius
    shoeBodies.forEach(shoeBody => {
      const bodyPos = shoeBody.position;
      
      const dx = bodyPos.x - pageX;
      const dy = bodyPos.y - pageY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Determine if we are hovering for click/cursor purposes
      if (dist < clickRadius) {
        isOverAnyShoe = true;
      }
      
      // Physical repulsion logic
      if (dist < interactionRadius && dist > 0) {
        // Play sound once when entering range
        if (hoverSound && !shoeBody.playedSound) {
          hoverSound.currentTime = 0;
          hoverSound.play().catch(() => {});
          shoeBody.playedSound = true;
        }

        // Calculate force based on proximity
        const forceFactor = (interactionRadius - dist) / interactionRadius;
        const forceMagnitude = forceFactor * maxForce;
        
        // Apply force away from the cursor
        Matter.Body.applyForce(shoeBody, {
          // Apply force slightly off-center to encourage natural rotation
          x: bodyPos.x + (Math.random() * 20 - 10), 
          y: bodyPos.y + (Math.random() * 20 - 10)
        }, {
          x: (dx / dist) * forceMagnitude,
          y: (dy / dist) * forceMagnitude
        });
      } else {
        // Reset sound flag when cursor leaves radius
        shoeBody.playedSound = false;
      }
    });

    // Update cursor mathematically to avoid DOM event thrashing
    if (isOverAnyShoe) {
      interactionArea.style.cursor = 'pointer';
    } else {
      interactionArea.style.cursor = 'default';
    }
  };

  interactionArea.addEventListener('pointermove', handleMouseMove);

  return function destroyMouseInteraction() {
    interactionArea.removeEventListener('pointermove', handleMouseMove);
    interactionArea.style.cursor = '';
  };
}
