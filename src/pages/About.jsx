import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './About.css';

export default function About() {
  return (
    <div className="pageContainer">
      <Navbar />
      <main className="aboutPage">
        <header className="aboutHero">
          <div className="aboutBadge">
            <span className="aboutBadgeDot" aria-hidden="true" />
            <span>SOLETHIEF ORIGIN • CURATED IN INDIA</span>
          </div>
          <h1 className="aboutTitle">THE VAULT MANIFESTO</h1>
          <p className="aboutSubtitle">
            Old soles with living history. Born for Indian street culture, driven by uncompromising craft and archival preservation.
          </p>
        </header>

        <section className="aboutNarrativeSection" aria-label="Vault narrative and core principles">
          <div className="aboutGrid">
            <article className="aboutCard">
              <span className="aboutCardIndex">01</span>
              <h2 className="aboutCardTitle">SUBCULTURE ROOTS</h2>
              <p className="aboutCardBody">
                We started SoleThief because the Indian sneaker subculture deserved better than bot-dominated drops and questionable restocks. We source individual authentic silhouette allocations with living history, built for collectors across India.
              </p>
            </article>

            <article className="aboutCard">
              <span className="aboutCardIndex">02</span>
              <h2 className="aboutCardTitle">JAPANESE CRAFT</h2>
              <p className="aboutCardBody">
                Guided by the principle of Kodawari—an uncompromising pursuit of quality and craft aesthetics. Every pair is treated not as disposable hype, but as an archival piece worthy of meticulous curation and archival care.
              </p>
            </article>

            <article className="aboutCard">
              <span className="aboutCardIndex">03</span>
              <h2 className="aboutCardTitle">ZERO FAKES</h2>
              <p className="aboutCardBody">
                Zero fakes, zero compromises. Each sneaker undergoes physical hands-on verification by specialists in India before arriving in custom sealed vault packaging with secure pan-India delivery.
              </p>
            </article>
          </div>
        </section>

        <section className="aboutCtaSection">
          <Link to="/new-drops" className="aboutCtaButton">
            EXPLORE VAULT DROPS <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
