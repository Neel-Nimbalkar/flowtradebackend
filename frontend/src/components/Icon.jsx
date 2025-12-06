import React from 'react';

const GeneratedIcon = ({ name, size, className, style, title }) => {
  const commonProps = { width: size, height: size, viewBox: '0 0 24 24', xmlns: 'http://www.w3.org/2000/svg', style };
  switch (name) {
    case 'chart':
      return (
        <svg {...commonProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title && <title>{title}</title>}
          <path d="M3 17h2v4H3z" fill="currentColor" fillOpacity="0.45" />
          <path d="M8 11h2v10H8z" fill="currentColor" fillOpacity="0.55" />
          <path d="M13 5h2v16h-2z" fill="currentColor" fillOpacity="0.7" />
          <path d="M18 13h2v8h-2z" fill="currentColor" fillOpacity="0.85" />
        </svg>
      );
    case 'puzzle':
      return (
        <svg {...commonProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title && <title>{title}</title>}
          <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeOpacity="0.35" />
          <rect x="13" y="3" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeOpacity="0.35" />
          <rect x="3" y="13" width="8" height="8" rx="1" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeOpacity="0.35" />
        </svg>
      );
    case 'bolt':
      return (
        <svg {...commonProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title && <title>{title}</title>}
          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" fill="currentColor" fillOpacity="0.9" stroke="currentColor" strokeOpacity="0.6" strokeWidth="0.4" />
        </svg>
      );
    case 'ai':
      return (
        <svg {...commonProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title && <title>{title}</title>}
          <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.32" />
          <circle cx="8" cy="8" r="1" fill="currentColor" fillOpacity="0.7" />
          <circle cx="16" cy="8" r="1" fill="currentColor" fillOpacity="0.7" />
          <path d="M8 16h8" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case 'drop':
      return (
        <svg {...commonProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title && <title>{title}</title>}
          <path d="M12 3s5 5.5 5 9a5 5 0 11-10 0c0-3.5 5-9 5-9z" fill="currentColor" fillOpacity="0.7" stroke="currentColor" strokeOpacity="0.45" />
        </svg>
      );
    case 'key':
      return (
        <svg {...commonProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title && <title>{title}</title>}
          <circle cx="7" cy="12" r="3" stroke="currentColor" strokeOpacity="0.5" fill="currentColor" fillOpacity="0.12" />
          <path d="M10 12h8" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="18" y="11" width="2" height="2" fill="currentColor" fillOpacity="0.65" />
        </svg>
      );
    case 'target':
      return (
        <svg {...commonProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title && <title>{title}</title>}
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeOpacity="0.45" fill="transparent" />
          <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.85" />
        </svg>
      );
    case 'search':
      return (
        <svg {...commonProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title && <title>{title}</title>}
          <circle cx="11" cy="11" r="5" stroke="currentColor" strokeOpacity="0.6" />
          <path d="M20 20l-4.5-4.5" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
};

const Icon = ({ name, className = '', alt = '', size = 18, style = {} }) => {
  if (!name) return null;
  // Prefer generated inline icons for consistency — fallback to public SVG file if unknown
  const generated = GeneratedIcon({ name, size, className, style, title: alt || name });
  if (generated) return generated;

  // fallback to external svg in /icons
  const src = `/icons/${name}.svg`;
  return (
    <img src={src} alt={alt || name} className={className} style={{ width: size, height: size, objectFit: 'contain', ...style }} onError={(e) => { e.target.style.display = 'none'; e.target.onerror = null; }} />
  );
};

export default Icon;
