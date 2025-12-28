import React from 'react';

const GeneratedIcon = ({ name, size, className, style, title }) => {
  const commonProps = { width: size, height: size, viewBox: '0 0 24 24', xmlns: 'http://www.w3.org/2000/svg', style };
  switch (name) {
    // Strategy template icons
    case 'trending-up':
      return (
        <svg {...commonProps} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {title && <title>{title}</title>}
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
          <polyline points="17 6 23 6 23 12"/>
        </svg>
      );
    case 'zap':
      return (
        <svg {...commonProps} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {title && <title>{title}</title>}
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      );
    case 'arrow-up-right':
      return (
        <svg {...commonProps} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {title && <title>{title}</title>}
          <line x1="7" y1="17" x2="17" y2="7"/>
          <polyline points="7 7 17 7 17 17"/>
        </svg>
      );
    case 'git-merge':
      return (
        <svg {...commonProps} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {title && <title>{title}</title>}
          <circle cx="18" cy="18" r="3"/>
          <circle cx="6" cy="6" r="3"/>
          <path d="M6 21V9a9 9 0 0 0 9 9"/>
        </svg>
      );
    case 'corner-down-right':
      return (
        <svg {...commonProps} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {title && <title>{title}</title>}
          <polyline points="15 10 20 15 15 20"/>
          <path d="M4 4v7a4 4 0 0 0 4 4h12"/>
        </svg>
      );
    case 'refresh-cw':
      return (
        <svg {...commonProps} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {title && <title>{title}</title>}
          <polyline points="23 4 23 10 17 10"/>
          <polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
      );
    case 'rotate-ccw':
      return (
        <svg {...commonProps} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {title && <title>{title}</title>}
          <polyline points="1 4 1 10 7 10"/>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
        </svg>
      );
    case 'sunrise':
      return (
        <svg {...commonProps} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {title && <title>{title}</title>}
          <path d="M17 18a5 5 0 0 0-10 0"/>
          <line x1="12" y1="2" x2="12" y2="9"/>
          <line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/>
          <line x1="1" y1="18" x2="3" y2="18"/>
          <line x1="21" y1="18" x2="23" y2="18"/>
          <line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/>
          <line x1="23" y1="22" x2="1" y2="22"/>
          <polyline points="8 6 12 2 16 6"/>
        </svg>
      );
    case 'radio':
      return (
        <svg {...commonProps} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {title && <title>{title}</title>}
          <circle cx="12" cy="12" r="2"/>
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>
        </svg>
      );
    case 'git-branch':
      return (
        <svg {...commonProps} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {title && <title>{title}</title>}
          <line x1="6" y1="3" x2="6" y2="15"/>
          <circle cx="18" cy="6" r="3"/>
          <circle cx="6" cy="18" r="3"/>
          <path d="M18 9a9 9 0 0 1-9 9"/>
        </svg>
      );
    case 'activity':
      return (
        <svg {...commonProps} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {title && <title>{title}</title>}
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      );
    // Existing icons
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
    case 'list':
      return (
        <svg {...commonProps} className={className} aria-hidden={!title} role={title ? 'img' : 'presentation'}>
          {title && <title>{title}</title>}
          <rect x="3" y="5" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.7" />
          <rect x="3" y="10.5" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.7" />
          <rect x="3" y="16" width="3" height="3" rx="0.5" fill="currentColor" fillOpacity="0.7" />
          <line x1="9" y1="6.5" x2="21" y2="6.5" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="9" y1="12" x2="21" y2="12" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="9" y1="17.5" x2="21" y2="17.5" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" strokeLinecap="round" />
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
