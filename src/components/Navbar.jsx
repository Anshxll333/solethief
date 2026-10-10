import React, { useEffect, useRef, useState } from 'react';
import { Menu, X, ShoppingCart } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
    }
  }, [location]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    const desktop = window.matchMedia('(min-width: 769px)');
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, [menuOpen]);

  return (
    <header className="homeHeader">
      <Link to="/" className="headerLogo" aria-label="SoleThief home" onClick={() => setMenuOpen(false)}>SOLETHIEF</Link>
      <nav id="primary-navigation" aria-label="Main navigation" className={`headerNav ${menuOpen ? 'isOpen' : ''}`} onClick={() => setMenuOpen(false)}>
        <Link to="/" className="navLink">Home</Link>
        <Link to="/shop" className="navLink">Shop</Link>
        <Link to="/#new-drops" className="navLink">New Drops</Link>
        <Link to="/#about" className="navLink">About</Link>
      </nav>
      <div className="headerIcons">
        <button ref={menuButton} className="iconButton mobileMenuButton" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <Link to="/cart" className="iconButton" aria-label="Shopping cart"><ShoppingCart size={24} /></Link>
      </div>
    </header>
  );
}
