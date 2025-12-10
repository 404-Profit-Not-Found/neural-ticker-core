import { useEffect, useRef, memo } from "react";
import { useAuth } from "../../context/AuthContext";

interface StocktwitsWidgetProps {
  colorTheme?: 'light' | 'dark';
}

function StocktwitsWidget({ colorTheme }: StocktwitsWidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  
  // Determine theme from user preference or prop
  const theme = colorTheme || (user?.theme === 'light' ? 'light' : 'dark');

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://widgets-api.stocktwits-cdn.com/loader.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = `
{
  "animated": true,
  "assetClass": "equity",
  "colorTheme": "${theme}",
  "location": "US",
  "logos": true,
  "quantity": 5,
  "sparklines": true,
  "transparent": true,
  "widget": "bar"
}
    `;
    container.current.appendChild(script);
  }, [theme]);

  return <div className="stocktwits-widget w-full" ref={container} />;
}

export default memo(StocktwitsWidget);
