import React from 'react';
import StarIcon from './StarIcon';

interface StarRatingProps {
  n: number;
}

const styles = {
  yellow: { color: 'gold' },
  cyan: { color: 'cyan' },
};

export function StarRating({ n}: StarRatingProps) {
  const isassist = n <= 0
  const assistStr = isassist ? <span 
    className="inline-flex items-center justify-center absolute top-0.5 left-3.5 text-black text-center font-bold"
    style={
      {
        'fontSize': '7px', 
        // 'backgroundColor':'#69d5fc', 
        // 'background':'linear-gradient(to bottom right, #a0e3fd, #a283e8)', 
        'background':`linear-gradient(
          to bottom right,
          #a0e3fd 0 33.3%,
          #66d7fc 33.3% 80.0%,
          #a0e3fd 80.0% 100%
          )
        `, 
        'borderRadius': '2px',
        'width': '7px',
        'height': '10px',
        'boxShadow': '0 0 0 0.5px #111  '
        // 'display': 'inline-block'
      }}
    >A</span> : ''
  const abs = (x:number)=> x>0?x:-x
  n = abs(n)
    
  const starNode = ((n:number)=>{
    if (n <= 5) {
      // return<span style={styles.yellow}>{n}⭑</span>;
      return <StarIcon number={n} color='#f6e94b' height={20} />
    } else if (n === 6) {
      // return <span style={styles.cyan}>?</span>;
      return <StarIcon number={''} color='#77e0ff' height={20} />
    } else if (n <= 10) {

      return <StarIcon number={n-6} color='#77e0ff' height={20} />
      // return <span style={styles.cyan}>{n - 6}⭑</span>;
    } else if (n === 11) {
      return <span style={styles.cyan}>(A)</span>;
    }
  })(n);

  return <span className='flex items-center relative'>{starNode}{assistStr}</span>;
}


