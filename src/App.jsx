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
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Fractional & Multi-Unit
        </span>
      </header>

      <main className="app-content">
        {activeTab === 'calc' && <Calculator />}
        {activeTab === 'bf' && <BoardFootEstimator />}
        {activeTab === 'chart' && <ReferenceChart />}
      </main>

      <nav className="bottom-nav">
        <button
          type="button"
          className={`nav-tab ${activeTab === 'calc' ? 'active' : ''}`}
          onClick={() => setActiveTab('calc')}
        >
          <span>📏 Calculator</span>
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'bf' ? 'active' : ''}`}
          onClick={() => setActiveTab('bf')}
        >
          <span>🪵 Board Feet</span>
        </button>
        <button
          type="button"
          className={`nav-tab ${activeTab === 'chart' ? 'active' : ''}`}
          onClick={() => setActiveTab('chart')}
        >
          <span>📐 Fraction Chart</span>
        </button>
      </nav>
    </>
  );
}
