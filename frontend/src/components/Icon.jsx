import React from 'react';

const Icon = ({ name, className = '', alt = '', size = 18, style = {} }) => {
  if (!name) return null;
  const src = `/icons/${name}.svg`;
  return (
    <img src={src} alt={alt || name} className={className} style={{ width: size, height: size, objectFit: 'contain', ...style }} onError={(e) => { e.target.style.display = 'inline-block'; e.target.onerror = null; }} />
  );
};

export default Icon;
