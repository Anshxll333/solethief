import React from 'react';

export default function Footer() {
  return (
    <footer className="footerContainer" id="about">
      <div className="footerLogo">SOLETHIEF</div>
      <p className="footerText">© {new Date().getFullYear()} SoleThief. All kicks reserved.</p>
    </footer>
  );
}
