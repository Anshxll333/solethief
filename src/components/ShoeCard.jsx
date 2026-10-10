import React from 'react';

export default function ShoeCard({ name, brand, size, price, frontImage, sideImage, onClick, onDetailsClick, showDetailsAction = false }) {
  return (
    <div className="shoeCard" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className={`shoeCardImageContainer ${sideImage ? 'hasSideImage' : ''}`}>
        <img src={frontImage} alt={`${name} front`} className="shoeImage shoeImageFront" />
        {sideImage && (
          <img src={sideImage} alt={`${name} side`} className="shoeImage shoeImageSide" />
        )}
      </div>
      <div className="shoeCardInfo">
        <span className="shoeBrand">{brand}</span>
        <h3 className="shoeName">{name}</h3>
        <div className="shoeDetailsRow">
          <span className="shoeSize">Size: {size}</span>
          <span className="shoePrice">&#8377;{price}</span>
        </div>
        {showDetailsAction ? (
          <div className="shoeCardActions">
            <button type="button" className="shopButton" aria-label={`View ${name}, ${size}`} onClick={(event) => { event.stopPropagation(); onClick?.(); }}>VIEW PAIR</button>
            <button type="button" className="shopButton shoeAddButton" aria-label={`Add+: open details for ${name}`} onClick={(event) => { event.stopPropagation(); onDetailsClick?.(); }}>Add+</button>
          </div>
        ) : (
          <button className="shopButton" aria-label={`View ${name}, ${size}`}>VIEW PAIR</button>
        )}
      </div>
    </div>
  );
}
