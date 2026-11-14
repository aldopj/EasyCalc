import React, { useState } from 'react';
import Calculator from './components/Calculator';
import BoardFootEstimator from './components/BoardFootEstimator';
import ReferenceChart from './components/ReferenceChart';

export default function App() {
  const [activeTab, setActiveTab] = useState('calc');

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <span>🪚 EasyCalc</span>
          <span className="brand-badge">US Woodshop</span>
        </div>

        <select
          aria-label="App Mode"
          className="mode-dropdown"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
        >
          <option value="calc">📏 Calculator</option>
          <option value="bf">🪵 Board Feet</option>
          <option value="chart">📐 Fraction Chart</option>
        </select>
      </header>

      <main className="app-content">
        {activeTab === 'calc' && <Calculator />}
        {activeTab === 'bf' && <BoardFootEstimator />}
        {activeTab === 'chart' && <ReferenceChart />}
      </main>
    </>
  );
}
