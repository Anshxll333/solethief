import React, { useEffect, useRef, useState } from 'react';
import { Menu, X, ShoppingCart, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useCommerce } from '../commerce/context.js';
import { useAuth } from '../auth/authContext.js';
import { isConfiguredAdminUser } from '../auth/adminAccess.js';

export default function Navbar() {
  const { cart } = useCommerce();
  const { user, profile, authStatus } = useAuth();
  const showAdminLink = authStatus === 'authenticated' && isConfiguredAdminUser(user);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null);
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/account') return location.pathname.startsWith('/account') || location.pathname === '/login';
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

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

  const cartItemCount = Array.isArray(cart?.items) && cart.items.length > 0
    ? cart.items.reduce((sum, item) => sum + (Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1), 0)
    : (cart?.ids || []).reduce((sum, id) => {
        const qty = cart.quantities?.[id] || cart.quantities?.[String(id)] || 1;
        return sum + (Number.isInteger(qty) && qty > 0 ? qty : 1);
      }, 0);

  return (
    <header className="homeHeader">
      <Link to="/" className="headerLogo" aria-label="SoleThief home" onClick={() => setMenuOpen(false)}>SOLETHIEF</Link>
      <nav id="primary-navigation" aria-label="Main navigation" className={`headerNav ${menuOpen ? 'isOpen' : ''}`} onClick={() => setMenuOpen(false)}>
        <Link to="/" className={`navLink ${isActive('/') ? 'active isActive' : ''}`.trim()}>HOME</Link>
        <Link to="/shop" className={`navLink ${isActive('/shop') ? 'active isActive' : ''}`.trim()}>SHOP</Link>
        <Link to="/new-drops" className={`navLink ${isActive('/new-drops') ? 'active isActive' : ''}`.trim()}>NEW DROPS</Link>
        <Link to="/about" className={`navLink ${isActive('/about') ? 'active isActive' : ''}`.trim()}>ABOUT</Link>
        {showAdminLink && (
          <Link to="/admin" className={`navLink ${isActive('/admin') ? 'active isActive' : ''}`.trim()}>ADMIN</Link>
        )}
      </nav>
      <div className="headerIcons">
        <button ref={menuButton} className="iconButton mobileMenuButton" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={24} strokeWidth={1.5} /> : <Menu size={24} strokeWidth={1.5} />}
        </button>
        <Link
          to="/account"
          className="iconButton navbarAccountLink"
          aria-label={user ? `Customer account: signed in as ${profile?.display_name || user.email}` : 'Customer account: guest'}
        >
          <User size={24} strokeWidth={1.5} />
          {user && <span className="navbarAuthDot" aria-hidden="true" />}
        </Link>
        <Link to="/cart" className="iconButton navbarCartLink" aria-label={`Shopping cart, ${cartItemCount} ${cartItemCount === 1 ? 'pair' : 'pairs'}`}>
          <ShoppingCart size={24} strokeWidth={1.5} />
          <span className="commerceCartCount">{cartItemCount}</span>
        </Link>
      </div>
    </header>
  );
}
