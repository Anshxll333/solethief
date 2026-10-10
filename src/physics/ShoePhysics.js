import Matter from 'matter-js';

export function createShoeBody(world, x, y, width, height, initialRotation = 0, config = {}) {
  // Default physics configuration
  const defaultMass = 5;
  const defaultFrictionAir = 0.04;
  const defaultRestitution = 0.3;
  const defaultStiffness = 0.02;
  const defaultConstraintLength = height;

  // Apply custom config
  const mass = config.mass ?? defaultMass;
  const frictionAir = config.frictionAir ?? defaultFrictionAir;
  const restitution = config.restitution ?? defaultRestitution;
  const stiffness = config.stiffness ?? defaultStiffness;
  const length = config.length ?? defaultConstraintLength;

  // Create the physical rectangle representing the shoe
  const shoeBody = Matter.Bodies.rectangle(x, y, width, height, {
    mass: mass,
    frictionAir: frictionAir, 
    restitution: restitution, 
    angle: initialRotation,
    frictionAngular: 0.05
  });

  // Create an anchor point above the shoe to act as the hanging point
  const anchorY = y - length; 
  
  const shoeConstraint = Matter.Constraint.create({
    pointA: { x: x, y: anchorY }, // Fixed point in space above the shoe
    bodyB: shoeBody, // The shoe body
    pointB: { x: 0, y: -height * 0.4 }, // Attach near the top center of the shoe
    stiffness: stiffness, 
    damping: 0.05, 
    length: length 
  });

  Matter.World.add(world, [shoeBody, shoeConstraint]);

  return { shoeBody, shoeConstraint };
}
