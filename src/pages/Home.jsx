import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import Matter from 'matter-js';
import Navbar from '../components/Navbar';
import { FeaturedCatalog } from '../commerce/CommerceUI';
import Footer from '../components/Footer';
import OpeningCurtain from '../components/OpeningCurtain';

import { createPhysicsWorld } from '../physics/PhysicsWorld';
import { createShoeBody } from '../physics/ShoePhysics';
import { createMouseInteraction } from '../physics/MousePhysics';
import { shoesData } from '../data/shoes';
import { useNavigate } from 'react-router-dom';


export default function Home() {
  const navigate = useNavigate();
  const titleRef = useRef(null);
  const subtitleRef = useRef(null);
  const descRef = useRef(null);
  const buttonRef = useRef(null);
  const shoeAreaRef = useRef(null);
  const heroSectionRef = useRef(null);

  // Array of refs for all 4 shoes
  const physicsShoesRefs = useRef([]);

  useEffect(() => {
    const media = gsap.matchMedia();
    media.add({
      desktop: "(min-width: 769px) and (any-pointer: fine)",
      reduceMotion: "(prefers-reduced-motion: reduce)",
      mobile: "(max-width: 768px)",
      all: "(min-width: 0px)"
    }, (context) => {
      const { desktop, mobile, reduceMotion } = context.conditions;
      const hero = heroSectionRef.current;
      let handleHeroClick;
      let layoutCleanup;
      // === GSAP UI ANIMATIONS ===
      if (!reduceMotion) {
        const tl = gsap.timeline({ delay: 0.6 }); // Delay slightly to sync with the curtain reveal

        tl.fromTo(titleRef.current,
          { y: 50, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" }
        )
          .fromTo(subtitleRef.current,
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" },
            "-=0.5"
          )
          .fromTo(descRef.current,
            { y: 20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, ease: "power3.out" },
            "-=0.6"
          )
          .fromTo(buttonRef.current,
            { y: 20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.7)" },
            "-=0.4"
          );

      }

      // === MATTER.JS MULTI-SHOE PHYSICS ===
      let physicsCleanup = null;
      let mousePhysicsCleanup = null;

      // Only initialize if our refs array is populated
      if (desktop && !reduceMotion && physicsShoesRefs.current.filter(Boolean).length === shoesData.length && hero) {

        const elements = physicsShoesRefs.current.filter(Boolean);
        let entrance;
        let frame;
        const stopPhysics = () => {
          entrance?.kill();
          if (handleHeroClick) hero.removeEventListener('click', handleHeroClick);
          mousePhysicsCleanup?.();
          physicsCleanup?.();
          handleHeroClick = null;
          mousePhysicsCleanup = null;
          physicsCleanup = null;
          elements.forEach(el => { el.style.transform = ''; });
          gsap.set(elements, { clearProps: 'transform,opacity' });
        };
        const initialize = () => {
          stopPhysics();
          if (elements.some(image => !image.complete || !image.naturalWidth)) return;
          const { engine, world, destroy: destroyPhysics } = createPhysicsWorld();
          physicsCleanup = destroyPhysics;

          // Add boundary walls to prevent shoes from flying out of the screen
          const w = hero.clientWidth;
          const h = hero.clientHeight;
          const t = 200; // wall thickness
          const walls = [
            Matter.Bodies.rectangle(w / 2, -t / 2, w * 2, t, { isStatic: true }), // Top
            Matter.Bodies.rectangle(w / 2, h + t / 2, w * 2, t, { isStatic: true }), // Bottom
            Matter.Bodies.rectangle(-t / 2, h / 2, t, h * 2, { isStatic: true }), // Left
            Matter.Bodies.rectangle(w + t / 2, h / 2, t, h * 2, { isStatic: true })  // Right
          ];
          Matter.World.add(world, walls);

          const bodies = [];
          const shoeData = [];

          // Create a body for each shoe
          physicsShoesRefs.current.forEach((shoeElement, index) => {
            if (!shoeElement) return;

            // Layout offsets ignore scroll position and animated transforms.
            const width = shoeElement.offsetWidth;
            const height = shoeElement.offsetHeight;
            const shoeX = shoeElement.offsetLeft + width / 2;
            const shoeY = shoeElement.offsetTop + height / 2;

            // Deep clone config so we don't mutate the static array
            const shoeDataObj = shoesData[index];
            const config = { ...shoeDataObj.physics };
            const initialRotation = config.initialRotation * (Math.PI / 180);

            const { shoeBody } = createShoeBody(world, shoeX, shoeY, width, height, initialRotation, config);

            bodies.push(shoeBody);
            shoeData.push({
              el: shoeElement,
              body: shoeBody,
              baseX: shoeX,
              baseY: shoeY,
              productData: shoeDataObj
            });
          });

          // Mouse and click positions share the hero-local physics coordinates.
          mousePhysicsCleanup = createMouseInteraction(engine, bodies, hero);

          // Sync DOM elements directly via hardware-accelerated 3D transforms for max FPS
          const syncShoes = () => {
            for (let i = 0; i < shoeData.length; i++) {
              const data = shoeData[i];
              const { position, angle } = data.body;

              const dx = position.x - data.baseX;
              const dy = position.y - data.baseY;
              const rotDeg = angle * (180 / Math.PI);

              data.el.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) rotate(${rotDeg.toFixed(2)}deg)`;
            }
          };
          Matter.Events.on(engine, 'afterUpdate', syncShoes);
          physicsCleanup = () => {
            Matter.Events.off(engine, 'afterUpdate', syncShoes);
            destroyPhysics();
          };

          // Mathematical click detection
          handleHeroClick = (e) => {
            if (e.target.closest('button, a')) return;
            const rect = hero.getBoundingClientRect();
            const pageX = e.clientX - rect.left;
            const pageY = e.clientY - rect.top;
            const clickRadius = 140; // Math radius matching MousePhysics.js

            for (const data of shoeData) {
              const bodyPos = data.body.position;
              const dx = bodyPos.x - pageX;
              const dy = bodyPos.y - pageY;
              if (Math.sqrt(dx * dx + dy * dy) < clickRadius) {
                navigate(`/product/${data.productData.id}`);
                break; // Stop checking after the first click hit
              }
            }
          };

          heroSectionRef.current.addEventListener('click', handleHeroClick);

          // GSAP Entrance animation for shoes (opacity and scale ONLY)
          entrance = gsap.fromTo(elements,
            { scale: 0, opacity: 0 },
            {
              scale: 1,
              opacity: 1,
              duration: 1.2,
              stagger: 0.2,
              ease: "elastic.out(1, 0.7)",
              delay: 0.5
            }
          );
        };
        const schedule = () => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(initialize);
        };
        elements.forEach(image => image.addEventListener('load', schedule));
        const observer = new ResizeObserver(schedule);
        observer.observe(hero);
        schedule();
        layoutCleanup = () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          elements.forEach(image => image.removeEventListener('load', schedule));
          stopPhysics();
        };
      }

      // Use bounded touch feedback on phones instead of desktop mouse repulsion.
      const touchCleanups = [];
      if (mobile && !reduceMotion) {
        physicsShoesRefs.current.filter(Boolean).forEach((shoe, index) => {
          let feedback;
          const tilt = shoesData[index].physics.initialRotation;
          const animateShoe = () => {
            feedback?.kill();
            feedback = gsap.timeline()
              .to(shoe, { y: -10, scale: 1.08, rotation: tilt + 8, duration: 0.2, overwrite: 'auto' })
              .to(shoe, { y: 0, scale: 1, rotation: tilt, duration: 0.8, ease: 'elastic.out(1, 0.5)' });
          };
          const hoverShoe = (event) => { if (event.pointerType !== 'touch') animateShoe(); };
          shoe.addEventListener('pointerdown', animateShoe, { passive: true });
          shoe.addEventListener('pointerenter', hoverShoe);
          touchCleanups.push(() => {
            shoe.removeEventListener('pointerdown', animateShoe);
            shoe.removeEventListener('pointerenter', hoverShoe);
            feedback?.kill();
            gsap.set(shoe, { clearProps: 'transform' });
          });
        });
      }

      return () => {
        layoutCleanup?.();
        touchCleanups.forEach(cleanup => cleanup());
        if (handleHeroClick) hero.removeEventListener('click', handleHeroClick);
        if (mousePhysicsCleanup) mousePhysicsCleanup();
        if (physicsCleanup) physicsCleanup();

      };
    });
    return () => media.revert();
  }, [navigate]);

  return (
    <div className="pageContainer">
      <OpeningCurtain />
      <Navbar />

      <section className="homeHero" ref={heroSectionRef}>
        <div className="heroShoeArea" ref={shoeAreaRef}>
          {shoesData.map((shoe, index) => (
            <img
              key={shoe.id}
              src={shoe.frontImage}
              alt={shoe.name}
              className={`floatingShoe shoe${shoe.id}`}
              ref={el => physicsShoesRefs.current[index] = el}
            />
          ))}
        </div>

        <div className="heroContent">
          <h1 className="heroTitle" ref={titleRef}>SOLETHIEF</h1>
          <h2 className="heroSubtitle" ref={subtitleRef}>CURATED STREET CULTURE.</h2>
          <p className="heroDescription" ref={descRef}>
            Rare silhouettes with a past.<br />Made for your next step.
          </p>
          <button className="heroButton" ref={buttonRef} onClick={() => document.getElementById('new-drops').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>EXPLORE THE ARCHIVE</button>
        </div>
      </section>

      <section className="featuredSection" id="new-drops">
        <div className="featuredHeader">
          <h2 className="featuredTitle">THE STREET DROP</h2>
          <p className="dropCaption">Old soles. New stories. Find your next pair.</p>
        </div>
        <FeaturedCatalog />
      </section>

      <Footer />
    </div>
  );
}
