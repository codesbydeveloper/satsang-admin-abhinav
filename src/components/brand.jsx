import logoFull from '../assets/logo-full.jpeg';
import spark from '../assets/spark.png';

// The client's official artwork. logo-full.jpeg has a white background, so it sits on a cream panel
// (no hard white box on the dark card). spark.png is transparent and works on any background.

export function FullLogo({ sub = 'Admin Panel' }) {
  return (
    <div className="auth-logo">
      <div className="auth-logo-panel"><img src={logoFull} alt="Satsang Spark" width="800" height="400" /></div>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function Spark({ size = 36 }) {
  return <img className="spark" src={spark} alt="Satsang Spark" width={size} height={size} />;
}
