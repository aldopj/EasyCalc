import React, { useState } from 'react';
import { parseAndEvaluate } from '../utils/parser';

const MODES = [
  { id: 'boards', label: '🪵 Boards' },
  { id: 'rectangle', label: '▭ Rectangle Top' },
  { id: 'circle', label: '◯ Round Top' },
];

const LUMBER_QUARTERS = [
  { label: '4/4 (1")', val: '1' },
  { label: '5/4 (1.25")', val: '1.25' },
  { label: '6/4 (1.5")', val: '1.5' },
  { label: '8/4 (2")', val: '2' },
  { label: '12/4 (3")', val: '3' },
];

function evalToInches(inputStr, defaultUnit = 'in') {
  if (!inputStr || !String(inputStr).trim()) return 0;
  const trimmed = String(inputStr).trim();
  try {
    // Check if the user wrote an explicit unit or fraction expression
    const qty = parseAndEvaluate(trimmed, defaultUnit === 'ft' ? 'ft-in' : 'in-fractional');
    if (qty.dimension === 1) {
      return Math.max(0, qty.value);
    }
    if (qty.dimension === 0) {
      const factor = defaultUnit === 'ft' ? 12 : 1;
      return Math.max(0, qty.value * factor);
    }
  } catch {
    const n = parseFloat(trimmed);
    if (!Number.isNaN(n)) {
      return Math.max(0, n * (defaultUnit === 'ft' ? 12 : 1));
    }
  }
  return 0;
}

export default function BoardFootEstimator() {
  const [mode, setMode] = useState('boards');

  // Shared settings
  const [thickness, setThickness] = useState('1');
  const [wastePct, setWastePct] = useState('0');
  const [pricePerBf, setPricePerBf] = useState('6.50');

  // Mode 1: Individual Boards
  const [boardWidthIn, setBoardWidthIn] = useState('6');
  const [boardLengthFt, setBoardLengthFt] = useState('8');
  const [quantity, setQuantity] = useState('4');

  // Mode 2: Rectangle (e.g. Table Top)
  const [rectWidthIn, setRectWidthIn] = useState('36');
  const [rectLengthIn, setRectLengthIn] = useState('72');
  const [rectCount, setRectCount] = useState('1');

  // Mode 3: Circle (circumscribed square D x D)
  const [circleDiameterIn, setCircleDiameterIn] = useState('48');
  const [circleCount, setCircleCount] = useState('1');

  const tIn = evalToInches(thickness, 'in');
  const waste = Math.max(0, parseFloat(wastePct) || 0);
  const price = Math.max(0, parseFloat(pricePerBf) || 0);

  let singleNetBf = 0;
  let itemCount = 1;
  let geometryNote = '';

  if (mode === 'boards') {
    const wIn = evalToInches(boardWidthIn, 'in');
    const lIn = evalToInches(boardLengthFt, 'ft');
    itemCount = Math.max(0, parseInt(quantity, 10) || 0);
    singleNetBf = (tIn * wIn * lIn) / 144;
    geometryNote = `${singleNetBf.toFixed(2)} BF per board × ${itemCount} board${itemCount === 1 ? '' : 's'}`;
  } else if (mode === 'rectangle') {
    const wIn = evalToInches(rectWidthIn, 'in');
    const lIn = evalToInches(rectLengthIn, 'in');
    itemCount = Math.max(0, parseInt(rectCount, 10) || 0);
    singleNetBf = (tIn * wIn * lIn) / 144;
    const areaSqFt = (wIn * lIn) / 144;
    geometryNote = `Surface Area: ${areaSqFt.toFixed(2)} sq ft (${wIn.toFixed(1)}" × ${lIn.toFixed(1)}")`;
  } else if (mode === 'circle') {
    const dIn = evalToInches(circleDiameterIn, 'in');
    itemCount = Math.max(0, parseInt(circleCount, 10) || 0);
    singleNetBf = (tIn * dIn * dIn) / 144;
    const sqAreaSqFt = (dIn * dIn) / 144;
    geometryNote = `Calculated using a circumscribing square (${dIn.toFixed(1)}" × ${dIn.toFixed(1)}", ${sqAreaSqFt.toFixed(2)} sq ft)`;
  }

  const netBf = singleNetBf * itemCount;
  const totalBf = netBf * (1 + waste / 100);
  const totalCost = totalBf * price;

  return (
    <div className="panel-card">
      <div>
        <h2 style={{ fontSize: '1.1rem', color: 'var(--wood-light)' }}>
          Lumber Board Foot Estimator
        </h2>
        {mode === 'circle' && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Calculated using a circumscribing square.
          </p>
        )}
      </div>

      {/* Mode Selector */}
      <div className="setting-group">
        <span className="setting-label">Calculation Mode</span>
        <div className="pill-row">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`pill-btn ${mode === m.id ? 'active' : ''}`}
              style={{ flex: 1, padding: '7px 8px' }}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rough Lumber Quarter Presets */}
      <div className="setting-group">
        <span className="setting-label">Rough Lumber Thickness (in)</span>
        <div className="pill-row" style={{ marginBottom: '4px' }}>
          {LUMBER_QUARTERS.map((q) => (
            <button
              key={q.label}
              type="button"
              className={`pill-btn ${thickness === q.val ? 'active' : ''}`}
              onClick={() => setThickness(q.val)}
            >
              {q.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          aria-label="Thickness (inches)"
          className="text-input"
          value={thickness}
          onChange={(e) => setThickness(e.target.value)}
          placeholder='e.g. 1 or 1 1/2"'
        />
      </div>

      {/* Mode-specific Inputs */}
      {mode === 'boards' && (
        <div className="form-grid">
          <div className="input-field">
            <label>Board Width (inches)</label>
            <input
              type="text"
              className="text-input"
              value={boardWidthIn}
              onChange={(e) => setBoardWidthIn(e.target.value)}
              placeholder='e.g. 6 or 5 1/2"'
            />
          </div>

          <div className="input-field">
            <label>Board Length (feet)</label>
            <input
              type="text"
              className="text-input"
              value={boardLengthFt}
              onChange={(e) => setBoardLengthFt(e.target.value)}
              placeholder="e.g. 8 or 10'"
            />
          </div>

          <div className="input-field">
            <label>Board Count (Qty)</label>
            <input
              type="number"
              min="1"
              step="1"
              className="text-input"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <div className="input-field">
            <label>Waste Allowance (%)</label>
            <input
              type="number"
              min="0"
              step="5"
              className="text-input"
              value={wastePct}
              onChange={(e) => setWastePct(e.target.value)}
            />
          </div>
        </div>
      )}

      {mode === 'rectangle' && (
        <div className="form-grid">
          <div className="input-field">
            <label>Panel Width (inches)</label>
            <input
              type="text"
              className="text-input"
              value={rectWidthIn}
              onChange={(e) => setRectWidthIn(e.target.value)}
              placeholder='e.g. 36 or 3&#39; 6"'
            />
          </div>

          <div className="input-field">
            <label>Panel Length (inches)</label>
            <input
              type="text"
              className="text-input"
              value={rectLengthIn}
              onChange={(e) => setRectLengthIn(e.target.value)}
              placeholder='e.g. 72 or 6&#39;'
            />
          </div>

          <div className="input-field">
            <label>Number of Panels</label>
            <input
              type="number"
              min="1"
              step="1"
              className="text-input"
              value={rectCount}
              onChange={(e) => setRectCount(e.target.value)}
            />
          </div>

          <div className="input-field">
            <label>Waste Allowance (%)</label>
            <input
              type="number"
              min="0"
              step="5"
              className="text-input"
              value={wastePct}
              onChange={(e) => setWastePct(e.target.value)}
            />
          </div>
        </div>
      )}

      {mode === 'circle' && (
        <div className="form-grid">
          <div className="input-field" style={{ gridColumn: 'span 2' }}>
            <label>Circle Diameter (inches)</label>
            <input
              type="text"
              className="text-input"
              value={circleDiameterIn}
              onChange={(e) => setCircleDiameterIn(e.target.value)}
              placeholder='e.g. 48 or 4&#39;'
            />
          </div>

          <div className="input-field">
            <label>Number of Circles</label>
            <input
              type="number"
              min="1"
              step="1"
              className="text-input"
              value={circleCount}
              onChange={(e) => setCircleCount(e.target.value)}
            />
          </div>

          <div className="input-field">
            <label>Waste Allowance (%)</label>
            <input
              type="number"
              min="0"
              step="5"
              className="text-input"
              value={wastePct}
              onChange={(e) => setWastePct(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="input-field">
        <label>Price per Board Foot ($ / BF)</label>
        <input
          type="number"
          step="0.25"
          className="text-input"
          value={pricePerBf}
          onChange={(e) => setPricePerBf(e.target.value)}
        />
      </div>

      {/* Results Summary */}
      <div className="bf-summary">
        <div>
          <div className="setting-label">Lumber Needed</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--wood-light)' }}>
            {totalBf.toFixed(2)} BF
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {geometryNote}
            {waste > 0 ? ` (+${waste}% waste from ${netBf.toFixed(2)} BF)` : ''}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div className="setting-label">Estimated Cost</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4ade80' }}>
            ${totalCost.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
