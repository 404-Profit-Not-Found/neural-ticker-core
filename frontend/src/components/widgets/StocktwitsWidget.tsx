import { useEffect, useRef, memo } from "react";

function StocktwitsWidget() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://widgets-api.stocktwits-cdn.com/loader.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = `
{
  "animated": false,
  "assetClass": "equity",
  "colorTheme": "dark",
  "location": "US",
  "logos": true,
  "quantity": 10,
  "sparklines": true,
  "transparent": true,
  "widget": "bar"
}
    `;
    container.current.appendChild(script);
  }, []);

  return <div className="stocktwits-widget w-full" ref={container} />;
}

export default memo(StocktwitsWidget);
