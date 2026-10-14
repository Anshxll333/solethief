import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import Matter from 'matter-js';
import Navbar from '../components/Navbar';
import { FeaturedCatalog } from '../commerce/CommerceUI';
import Footer from '../components/Footer';
import OpeningCurtain from '../components/OpeningCurtain';

import { createPhysicsWorld } from '../physics/PhysicsWorld';
import { createShoeBody } from '../physics/ShoePhysics';
import { createMouseInteraction } from '../physics/MousePhysics';
import { getHomeShowcaseShoes, subscribeHomeShowcase } from '../services/homeShowcase';
import Shoe from '../components/Shoe';
import { useNavigate } from 'react-router-dom';


export default function Home() {
  const navigate = useNavigate();
  const [shoes, setShoes] = useState(() => getHomeShowcaseShoes());
  const titleRef = useRef(null);
  const subtitleRef = useRef(null);
  const descRef = useRef(null);
  const buttonRef = useRef(null);
  const shoeAreaRef = useRef(null);
  const heroSectionRef = useRef(null);

  // Array of refs for all showcase shoes
  const physicsShoesRefs = useRef([]);

  useEffect(() => {
    return subscribeHomeShowcase((updated) => {
      setShoes(updated);
    });
  }, []);

  useEffect(() => {
    physicsShoesRefs.current = physicsShoesRefs.current.slice(0, shoes.length);

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
      if (desktop && !reduceMotion && physicsShoesRefs.current.filter(Boolean).length === shoes.length && hero && shoes.length > 0) {

        const elements = physicsShoesRefs.current.filter(Boolean);
        // Ensure elements don't flash on screen before physics and entrance are initialized
        gsap.set(elements, { opacity: 0 });

        let entrance;
        let frame;
        let hasInitialized = false;
        let resizeTimeout = null;
        const scaleState = { value: 0.2 };

        const stopPhysics = () => {
          entrance?.kill();
          if (handleHeroClick) hero.removeEventListener('click', handleHeroClick);
          mousePhysicsCleanup?.();
          physicsCleanup?.();
          handleHeroClick = null;
          mousePhysicsCleanup = null;
          physicsCleanup = null;
          elements.forEach(el => { el.style.transform = ''; });
        };

        const initialize = () => {
          if (elements.some(image => !image.complete || !image.naturalWidth)) return;
          if (hasInitialized) return;
          hasInitialized = true;

          stopPhysics();
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
            const shoeDataObj = shoes[index];
            if (!shoeDataObj) return;
            const config = {
              mass: 1.2,
              frictionAir: 0.05,
              restitution: 0.4,
              initialRotation: 0,
              ...(shoeDataObj.physics || {}),
            };
            const initialRotation = (config.initialRotation || 0) * (Math.PI / 180);

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

          // Sync DOM elements directly via hardware-accelerated 3D transforms with RAF coalescing
          // Unified with entrance scaleState to prevent GSAP and Matter.js transform fighting on Windows
          let syncRafId = null;
          const syncShoes = () => {
            if (syncRafId) return;
            syncRafId = requestAnimationFrame(() => {
              syncRafId = null;
              const curScale = scaleState.value;
              for (let i = 0; i < shoeData.length; i++) {
                const data = shoeData[i];
                if (!data.el) continue;
                const { position, angle } = data.body;

                const dx = position.x - data.baseX;
                const dy = position.y - data.baseY;
                const rotDeg = angle * (180 / Math.PI);

                data.el.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) rotate(${rotDeg.toFixed(2)}deg) scale(${curScale.toFixed(3)})`;
              }
            });
          };
          Matter.Events.on(engine, 'afterUpdate', syncShoes);
          physicsCleanup = () => {
            if (syncRafId) {
              cancelAnimationFrame(syncRafId);
              syncRafId = null;
            }
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

          // Smooth entrance without transform collision
          const hasCurtainPlayed = typeof window !== 'undefined' && Boolean(window.__solethief_noren_played);
          const entranceDelay = hasCurtainPlayed ? 0.05 : 0.45;
          entrance = gsap.timeline({ delay: entranceDelay });
          entrance.fromTo(elements,
            { opacity: 0 },
            {
              opacity: 1,
              duration: 0.8,
              stagger: 0.1,
              ease: "power2.out"
            },
            0
          ).fromTo(scaleState,
            { value: 0.2 },
            {
              value: 1,
              duration: 1.1,
              ease: "elastic.out(1, 0.75)"
            },
            0
          );
        };

        const schedule = () => {
          if (hasInitialized) return;
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(initialize);
        };

        elements.forEach(image => image.addEventListener('load', schedule));
        const handleResize = () => {
          if (!hasInitialized) {
            schedule();
            return;
          }
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            hasInitialized = false;
            schedule();
          }, 250);
        };
        const observer = new ResizeObserver(handleResize);
        observer.observe(hero);
        schedule();

        layoutCleanup = () => {
          cancelAnimationFrame(frame);
          clearTimeout(resizeTimeout);
          observer.disconnect();
          elements.forEach(image => image.removeEventListener('load', schedule));
          stopPhysics();
          gsap.set(elements, { clearProps: 'transform,opacity' });
        };
      }

      // Use bounded touch feedback on phones instead of desktop mouse repulsion.
      const touchCleanups = [];
      if (mobile && !reduceMotion) {
        physicsShoesRefs.current.filter(Boolean).forEach((shoe, index) => {
          let feedback;
          const tilt = shoes[index]?.physics?.initialRotation || 0;
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
  }, [navigate, shoes]);

  return (
    <div className="pageContainer">
      <OpeningCurtain />
      <Navbar />

      <section className="homeHero" ref={heroSectionRef}>
        <div className="heroShoeArea" ref={shoeAreaRef}>
          {shoes.map((shoe, index) => (
            <Shoe
              key={shoe.id || index}
              shoe={shoe}
              index={index}
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
          <button className="heroButton" ref={buttonRef} onClick={() => navigate('/shop')}>FIND YOUR SOLE</button>
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
