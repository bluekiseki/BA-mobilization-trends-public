export const PlayIcon = ({ className = 'w-3 h-3' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8 5v14l11-7z" />
  </svg>
);

export const StopIcon = ({ className = 'w-3 h-3' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M6 6h12v12H6z" />
  </svg>
);

export const PyroxenesIcon = ({ title = 'Home', className = 'w-10 h-10' }) => {
  return (
    <svg className={className} width="200" height="200" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <title>{title}</title>
      <defs>
        <linearGradient id="leftRect" x1="0%" y1="10%" x2="80%" y2="100%">
          <stop offset="20%" stopColor="#FFADD2" />
          <stop offset="80%" stopColor="#8BCFFF" />
        </linearGradient>
        <linearGradient id="rightRect" x1="0%" y1="10%" x2="80%" y2="100%">
          <stop offset="40%" stopColor="#F5F2FF" />
          <stop offset="60%" stopColor="#C9BEFF" />
          <stop offset="100%" stopColor="#B1BCFF" />
        </linearGradient>
        <linearGradient id="downCenterTrig" x1="0%" y1="20%" x2="70%" y2="100%">
          <stop offset="30%" stopColor="#8BCFFF" />
          <stop offset="90%" stopColor="#A38FFF" />
        </linearGradient>

        <linearGradient id="rainbowEffect" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF8FAB" />
          <stop offset="25%" stopColor="#FAFF99" />
          <stop offset="50%" stopColor="#B0FFAB" />
          <stop offset="75%" stopColor="#7FF0FF" />
          <stop offset="100%" stopColor="#A38FFF" />
        </linearGradient>
      </defs>

      <line x1="17" y1="31" x2="83" y2="31" stroke="#DCD3FF" strokeWidth="0.3" />
      <line x1="17" y1="69" x2="83" y2="69" stroke="#DCD3FF" strokeWidth="0.3" />
      <line x1="31" y1="31" x2="31" y2="69" stroke="#DCD3FF" strokeWidth="0.3" />
      <line x1="69" y1="31" x2="69" y2="69" stroke="#DCD3FF" strokeWidth="0.3" />
      <line x1="69" y1="31" x2="31" y2="69" stroke="#DCD3FF" strokeWidth="0.3" />
      <line x1="31" y1="31" x2="69" y2="69" stroke="#DCD3FF" strokeWidth="0.3" />
      <line x1="31" y1="31" x2="50" y2="8" stroke="#DCD3FF" strokeWidth="0.3" />
      <line x1="69" y1="31" x2="50" y2="8" stroke="#DCD3FF" strokeWidth="0.3" />
      <line x1="31" y1="69" x2="50" y2="92" stroke="#DCD3FF" strokeWidth="0.3" />
      <line x1="69" y1="69" x2="50" y2="92" stroke="#DCD3FF" strokeWidth="0.3" />

      <polygon points="50,8 17,31 31,31" fill="#F5F2FF" stroke="#A38FFF" strokeWidth="1" strokeLinejoin="bevel" />
      <polygon points="50,8 31,31 69,31" fill="url(#rainbowEffect)" stroke="#A38FFF" strokeWidth="1" strokeLinejoin="bevel" />
      <polygon points="50,8 83,31 69,31" fill="#F5F2FF" stroke="#A38FFF" strokeWidth="1" strokeLinejoin="bevel" />
      <polygon points="50,93 17,69 31,69" fill="#8BCFFF" stroke="#A38FFF" strokeWidth="1" strokeLinejoin="bevel" />
      <polygon points="50,93 31,69 69,69" fill="url(#downCenterTrig)" stroke="#A38FFF" strokeWidth="1" strokeLinejoin="bevel" />
      <polygon points="50,93 83,69 69,69" fill="#E2DBFF" stroke="#A38FFF" strokeWidth="1" strokeLinejoin="bevel" />

      <polygon points="17,31 31,31 31,69 17,69" fill="url(#leftRect)" stroke="#A38FFF" strokeWidth="1" strokeLinejoin="bevel" />
      <polygon points="83,31 69,31 69,69 83,69" fill="url(#rightRect)" stroke="#A38FFF" strokeWidth="1" strokeLinejoin="bevel" />

      <polygon points="31,31 31,69 50,50" fill="#8B78D6" stroke="#A38FFF" strokeWidth="1" strokeLinejoin="bevel" />
      <polygon points="31,69 69,69 50,50" fill="#FFADD2" stroke="#A38FFF" strokeWidth="1" strokeLinejoin="bevel" />
      <polygon points="69,69 69,31 50,50" fill="url(#rainbowEffect)" stroke="#A38FFF" strokeWidth="1" strokeLinejoin="bevel" />
      <polygon points="69,31 31,31 50,50" fill="#C9BEFF" stroke="#A38FFF" strokeWidth="1" strokeLinejoin="bevel" />

      <polygon points="50,8 83,31 83,69 50,92 17,69 17,31" fill="none" stroke="#A38FFF" strokeWidth="2" />
    </svg>
  );
};

export const ChevronIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`h-5 w-5 transition-transform duration-300 ${className}`}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
);
