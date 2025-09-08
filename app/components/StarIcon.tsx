// app/StarIcon.tsx
import React from 'react';

interface StarIconProps {
  number: number|string;
  height?: number;
  color?: string;
}

const StarIcon: React.FC<StarIconProps> = ({
  number,
  height = 24,
  color = '#77e0ff',
}) => {

  const fontSize = height * (2 / 3);
  const shadowSize = height / 12;

  return (
    <div style={{
      position: 'relative',
      width: `${height}px`,
      height: `${height}px`,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 576 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ position: 'absolute' }}
      >
        <path
          fill={color}
          d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"
          style={{
            filter: `drop-shadow(0px 0px ${shadowSize}px rgba(0, 191, 255, 0.5))`
          }}
        />
      </svg>
      <span style={{
        position: 'relative',
        zIndex: 1,
        color: 'black',
        fontSize: `${fontSize}px`,
        fontWeight: 'bold',
        lineHeight: '1',
        fontStyle: 'italic'
      }}>{number}</span>
    </div>
  );
};

export default StarIcon;