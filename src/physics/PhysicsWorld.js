import Matter from 'matter-js';

export function createPhysicsWorld() {
  const engine = Matter.Engine.create();
  const world = engine.world;
  
  // Set gravity slightly lower for a floaty, streetwear feel
  engine.gravity.y = 0.8;
  
  // Create a runner to manage the engine loop
  const runner = Matter.Runner.create();
  Matter.Runner.run(runner, engine);

  function destroy() {
    Matter.Runner.stop(runner);
    Matter.Engine.clear(engine);
    // Remove all bodies and constraints from the world
    Matter.Composite.clear(world);
  }

  return { engine, world, runner, destroy };
}
