import React from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function Shop() {
  return (
    <div className="pageContainer">
      <Navbar />
      <div style={{ padding: '8rem 2rem', textAlign: 'center', flex: 1 }}>
        <h1>SHOP ARCHIVE</h1>
        <p>Coming Soon</p>
      </div>
      <Footer />
    </div>
  );
}
