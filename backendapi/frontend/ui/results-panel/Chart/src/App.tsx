import './App.css';
import { StrategyChart } from './components/StrategyChart';
import { useEffect } from 'react';
import { dataService } from './dataService';

function App() {
  useEffect(() => {
    // Connect to Alpaca with provided credentials
    dataService.connectAlpaca(
      'PKUPMQN6LW6UVWCFLJWVZAVWZU',
      'AEVrrNp9zRVA1SFumPcE8pZC7DVd3G8GigQtxLnFpMWQ',
      'AAPL' // You can change the symbol if desired
    );
    // Cleanup: disconnect on unmount
    return () => dataService.stop();
  }, []);
  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 24, background: '#181A20', borderRadius: 12, boxShadow: '0 2px 16px #0006' }}>
      <h2 style={{ color: '#A1A6B2', marginBottom: 24, fontWeight: 500 }}>Real-Time Trading Chart (Alpaca Live)</h2>
      <StrategyChart />
    </div>
  );
}

export default App;
