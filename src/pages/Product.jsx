import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProductDetails from '../components/ProductDetails';
import ProductGallery from '../components/ProductGallery';
import { shoesData } from '../data/shoes';

export default function Product({ imagesOnly = false }) {
  const { id } = useParams();
  
  const shoe = shoesData.find((s) => s.id === parseInt(id));

  useEffect(() => {
    // Scroll to top when opening a product
    window.scrollTo(0, 0);
  }, [id, imagesOnly]);

  if (!shoe) return null;

  return (
    <div className="pageContainer">
      <Navbar />
      {imagesOnly ? <ProductGallery key={shoe.id} shoe={shoe} /> : <ProductDetails key={shoe.id} shoe={shoe} />}
      <Footer />
    </div>
  );
}
