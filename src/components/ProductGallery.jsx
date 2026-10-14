import React from 'react';
import TransparentArtwork from './TransparentArtwork';
import { normalizeShoeAssetPath } from '../services/transparentArtwork.js';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function ProductGallery({ shoe }) {
  const fallbackMain = normalizeShoeAssetPath(shoe.frontImage || shoe.image || '/shoes/transparent/shoe-1-front.png');
  const fallbackSide = normalizeShoeAssetPath(shoe.sideImage) || fallbackMain;

  let extraImages = [];
  if (Array.isArray(shoe.additionalImages)) {
    extraImages = shoe.additionalImages;
  } else if (typeof shoe.additionalImages === 'string' && shoe.additionalImages.trim()) {
    extraImages = shoe.additionalImages.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  const rawImages = shoe.images?.length
    ? shoe.images
    : [shoe.frontImage || fallbackMain, shoe.sideImage || fallbackSide, ...extraImages].filter(Boolean);

  const images = rawImages
    .map(normalizeShoeAssetPath)
    .map((src, index) => ({
      src,
      label: `Image ${index + 1}`,
    }))
    .filter((image) => image.src);

  return (
    <main className="pairDetails pairImagesOnly">
      <nav className="pairBreadcrumb" aria-label="Breadcrumb">
        <Link to={`/product/${shoe.id}`} className="pairBreadcrumbBack">
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" /> Back to shoe
        </Link>
        <span className="pairBreadcrumbDivider">/</span>
        <span className="pairBreadcrumbCurrent">{shoe.name} &mdash; Gallery</span>
      </nav>
      <h1 className="pairImagesTitle">{shoe.name}</h1>
      <section className="pairImagesGallery" aria-label={`${shoe.name} image gallery`}>
        {images.map((image, index) => (
          <div className="pairFreeImageStage" key={image.src + index}>
            <TransparentArtwork
              className="pairMainImage"
              src={image.src}
              alt={shoe.name}
              fallback={<img src={fallbackMain} alt={shoe.name} className="pairMainImage" />}
            />
            <span className="pairImageCounter">{String(index + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
