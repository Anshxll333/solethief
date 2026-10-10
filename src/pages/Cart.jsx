import React from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

export default function Cart() {
  return (
    <div className="pageContainer">
      <Navbar />
      <div style={{ padding: '8rem 2rem', textAlign: 'center', flex: 1 }}>
        <h1>CART</h1>
        <p>Coming Soon</p>
      </div>
      <Footer />
    </div>
  );
}
