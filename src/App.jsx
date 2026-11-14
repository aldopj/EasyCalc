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
          <svg
            className="brand-caliper-icon"
            viewBox="0 0 28 28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {/* Main scale beam */}
            <rect
              x="2"
              y="7"
              width="24"
              height="5"
              rx="1.2"
              fill="#272c38"
              stroke="#f59e0b"
              strokeWidth="1.8"
            />
            {/* Tick marks along beam */}
            <path
              d="M7 7v2.5M11 7v2M15 7v2.5M19 7v2M23 7v2.5"
              stroke="#f59e0b"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            {/* Fixed left jaw */}
            <path
              d="M2 7V3.5L5.5 7M2 12v11.5L6.5 18V12"
              fill="#f59e0b"
              stroke="#f59e0b"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            {/* Sliding vernier jaw */}
            <path
              d="M14 7V3.5L10.5 7M13.5 12v6l4.5 5.5V12"
              fill="#38bdf8"
              stroke="#38bdf8"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            {/* Slider carriage */}
            <rect
              x="12.5"
              y="6.2"
              width="6.5"
              height="6.6"
              rx="1"
              fill="#181b22"
              stroke="#38bdf8"
              strokeWidth="1.5"
            />
          </svg>
          <span>Pocket Calipers</span>
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
