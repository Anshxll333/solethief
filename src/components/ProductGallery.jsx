import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function ProductGallery({ shoe }) {
  const images = [
    { src: shoe.frontImage, label: 'Front view' },
    { src: shoe.sideImage, label: 'Side view' },
  ].filter(image => image.src);

  return (
    <main className="pairDetails pairImagesOnly">
      <nav className="pairBreadcrumb" aria-label="Breadcrumb">
        <Link to="/#new-drops"><ArrowLeft size={15} aria-hidden="true" /> Back to the archive</Link>
        <span aria-current="page">{shoe.name} / Images</span>
      </nav>
      <h1 className="pairImagesTitle">{shoe.name}</h1>
      <section className="pairImagesGallery" aria-label={`${shoe.name} image gallery`}>
        {images.map((image, index) => (
          <div className="pairImageStage" key={image.src}>
            <img className="pairMainImage" src={image.src} alt={`${shoe.name} - ${image.label}`} />
            <span className="pairImageCounter">{index + 1} / {images.length} &mdash; {image.label}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
