import React, { useState, useMemo, useRef } from 'react';
import {
  parseAndEvaluate,
  formatQuantity,
  convertDimensionlessToActiveUnit,
} from '../utils/parser';

const BASE_UNITS = [
  { id: 'in-fractional', label: 'in (1/x)' },
  { id: 'ft-in', label: 'ft & in' },
  { id: 'in-decimal', label: 'in (dec)' },
  { id: 'mm', label: 'mm' },
  { id: 'cm', label: 'cm' },
  { id: 'm', label: 'm' },
];

const PRECISIONS = [2, 4, 8, 16, 32, 64];

const QUICK_FRACTIONS = [
  '1/2',
  '1/4',
  '3/4',
  '1/8',
  '3/8',
  '5/8',
  '7/8',
  '1/16',
  '3/16',
  '5/16',
  '1/32',
  '1/64',
];

const UNITS = [
  { label: 'in (")', token: '"' },
  { label: "ft (')", token: "'" },
  { label: 'mm', token: 'mm ' },
  { label: 'cm', token: 'cm ' },
  { label: 'm', token: 'm ' },
  { label: 'Space', token: ' ' },
];

const VAR_PRESETS = [
  'Width',
  'Height',
  'Length',
  'Depth',
  'Thickness',
  'Kerf',
  'Stile',
  'Rail',
  'Dado',
  'Reveal',
];

export default function Calculator() {
  const [expression, setExpression] = useState('2\' 6 1/2" + 150mm + 3 3/8"');
  const [baseUnit, setBaseUnit] = useState('in-fractional');
  const [precision, setPrecision] = useState(16);

  // Named variables dictionary keyed by lowercase name
  const [variables, setVariables] = useState({
    width: {
      name: 'Width',
      qty: { value: 57.75, dimension: 1 },
      formatted: '57 3/4"',
    },
    kerf: {
      name: 'Kerf',
      qty: { value: 0.125, dimension: 1 },
      formatted: '1/8"',
    },
  });

  const [history, setHistory] = useState([
    {
      id: 1,
      expr: '4\' 6" + 12 3/4"',
      result: '57 3/4"',
      qty: { value: 57.75, dimension: 1 },
      varName: 'Width',
    },
    {
      id: 2,
      expr: '24" - 3/4" * 2',
      result: '22 1/2"',
      qty: { value: 22.5, dimension: 1 },
      varName: null,
    },
  ]);

  const [isTapeOpen, setIsTapeOpen] = useState(false);
  const [isVarPickerOpen, setIsVarPickerOpen] = useState(false);
  const [customAssignInput, setCustomAssignInput] = useState('');
  const [namingItemId, setNamingItemId] = useState(null);
  const [customTapeName, setCustomTapeName] = useState('');

  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [showCommitError, setShowCommitError] = useState(false);
  const gestureStartY = useRef(null);
  const didDragRef = useRef(false);
  const lastCommittedExprRef = useRef(null);
  const lastValidEvalRef = useRef(null);

  // Format stored variables using current base unit and precision
  const formattedVariablesList = useMemo(() => {
    return Object.values(variables).map((v) => ({
      ...v,
      liveFormatted: formatQuantity(v.qty, baseUnit, precision).formatted,
    }));
  }, [variables, baseUnit, precision]);

  // Check if expression is currently expecting a number/variable slot
  const expectsOperand = useMemo(() => {
    const trimmed = expression.trim();
    if (!trimmed) return true;
    return /[+\-*/=(]$/.test(trimmed);
  }, [expression]);

  const evaluation = useMemo(() => {
    const buildSuccess = (qty) => {
      const fmt = formatQuantity(qty, baseUnit, precision);
      let allConversions = null;
      if (qty.dimension === 1) {
        const inches = qty.value;
        const ftIn = formatQuantity(qty, 'ft-in', precision).formatted;
        const fracIn = formatQuantity(qty, 'in-fractional', precision).formatted;
        const mm = (inches * 25.4).toFixed(1) + ' mm';
        const cm = (inches * 2.54).toFixed(2) + ' cm';
        allConversions = { ftIn, fracIn, mm, cm };
      }
      return {
        ok: true,
        qty,
        assignedVar: qty.assignedVar || null,
        ...fmt,
        allConversions,
      };
    };

    const emptyState = {
      ok: true,
      formatted: '0"',
      exactDec: '0.0000 in',
      isApproximate: false,
      allConversions: null,
      assignedVar: null,
    };

    if (!expression.trim()) {
      lastValidEvalRef.current = emptyState;
      return emptyState;
    }
    try {
      const qty = parseAndEvaluate(expression, baseUnit, variables);
      const res = buildSuccess(qty);
      lastValidEvalRef.current = res;
      return res;
    } catch (err) {
      // Try evaluating the completed prefix before trailing operators/incomplete fraction slash while typing
      let previewEval = lastValidEvalRef.current || emptyState;
      const stripped = expression
        .replace(/(\s+\d+\/?\s*|\s*[+\-*/×÷−(]+\s*)$/, '')
        .trim();
      if (stripped && stripped !== expression.trim()) {
        try {
          const partialQty = parseAndEvaluate(stripped, baseUnit, variables);
          previewEval = buildSuccess(partialQty);
          lastValidEvalRef.current = previewEval;
        } catch {
          // Keep previous valid evaluation
        }
      }
      return {
        ok: false,
        error: err.message,
        preview: previewEval,
      };
    }
  }, [expression, baseUnit, precision, variables]);

  const displayedEval = evaluation.ok
    ? evaluation
    : evaluation.preview || {
        formatted: '0"',
        exactDec: '0.0000 in',
        isApproximate: false,
        allConversions: null,
        assignedVar: null,
      };

  const appendToken = (token) => {
    lastCommittedExprRef.current = null;
    setShowCommitError(false);
    setIsVarPickerOpen(false);
    setExpression((prev) => {
      if (/^\d+\/\d+$/.test(token) && /\d$/.test(prev)) {
        return `${prev} ${token}`;
      }
      return `${prev}${token}`;
    });
  };

  const insertVariableIntoExpression = (varName) => {
    lastCommittedExprRef.current = null;
    setShowCommitError(false);
    setExpression((prev) => {
      const trimmed = prev.trimEnd();
      if (!trimmed) return `[${varName}]`;
      if (/[+\-*/=(]$/.test(trimmed)) {
        return `${trimmed} [${varName}]`;
      }
      return `${prev} + [${varName}]`;
    });
    setIsVarPickerOpen(false);
  };

  const startVariableAssignment = (varName) => {
    const clean = varName.trim().replace(/\s+/g, '_');
    if (!clean) return;
    lastCommittedExprRef.current = null;
    setShowCommitError(false);
    setExpression((prev) => {
      const trimmed = prev.trim();
      // If there's already a valid number/expression without '=', wrap it as `varName = <prev>`
      if (trimmed && !trimmed.includes('=')) {
        return `${clean} = ${trimmed}`;
      }
      return `${clean} = `;
    });
    setCustomAssignInput('');
    setIsVarPickerOpen(false);
  };

  const handleBackspace = () => {
    lastCommittedExprRef.current = null;
    setShowCommitError(false);
    setExpression((prev) => {
      // Delete an entire [VarName] pill in one tap
      const bracketMatch = prev.match(/(\s*\[[^\]]+\]\s*)$/);
      if (bracketMatch) {
        return prev.slice(0, prev.length - bracketMatch[1].length);
      }
      return prev.slice(0, -1);
    });
  };

  const handleClear = () => {
    lastCommittedExprRef.current = null;
    setShowCommitError(false);
    setExpression('');
    setIsVarPickerOpen(false);
  };

  const assignVariableToHistoryItem = (itemId, rawName) => {
    const cleanName = rawName.trim().replace(/\s+/g, '_');
    if (!cleanName) return;

    setHistory((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const storedQty =
            item.qty.dimension === 0
              ? convertDimensionlessToActiveUnit(item.qty, baseUnit)
              : item.qty;
          setVariables((vPrev) => ({
            ...vPrev,
            [cleanName.toLowerCase()]: {
              name: cleanName,
              qty: storedQty,
              formatted: item.result,
            },
          }));
          return { ...item, varName: cleanName };
        }
        return item;
      })
    );
    setNamingItemId(null);
    setCustomTapeName('');
  };

  const deleteHistoryItem = (itemId) => {
    setHistory((prev) => {
      const target = prev.find((i) => i.id === itemId);
      const remaining = prev.filter((i) => i.id !== itemId);
      if (target && target.varName) {
        const key = target.varName.toLowerCase();
        const stillUsed = remaining.some(
          (i) => i.varName && i.varName.toLowerCase() === key
        );
        if (!stillUsed) {
          setVariables((vPrev) => {
            const next = { ...vPrev };
            delete next[key];
            return next;
          });
        }
      }
      return remaining;
    });
    if (namingItemId === itemId) {
      setNamingItemId(null);
    }
    lastCommittedExprRef.current = null;
  };

  const handleEvaluateCommit = () => {
    if (!expression.trim()) return;
    if (!evaluation.ok) {
      setShowCommitError(true);
      return;
    }
    setShowCommitError(false);
    if (evaluation.ok && expression.trim()) {
      const currentTrimmed = expression.trim();
      const resultTrimmed = evaluation.formatted.trim();

      // Do not add to Notes if hitting '=' again with no change to the expression
      const isUnchangedRepeat =
        lastCommittedExprRef.current === currentTrimmed ||
        (history[0] &&
          (history[0].expr.trim() === currentTrimmed ||
            (history[0].result.trim() === currentTrimmed &&
              !evaluation.assignedVar)));

      if (isUnchangedRepeat) {
        setIsVarPickerOpen(false);
        return;
      }

      const storedQty =
        evaluation.qty.dimension === 0
          ? convertDimensionlessToActiveUnit(evaluation.qty, baseUnit)
          : evaluation.qty;

      const assignedName = evaluation.assignedVar || null;

      if (assignedName) {
        setVariables((prev) => ({
          ...prev,
          [assignedName.toLowerCase()]: {
            name: assignedName,
            qty: storedQty,
            formatted: evaluation.formatted,
          },
        }));
      }

      setHistory((prev) => [
        {
          id: Date.now(),
          expr: expression,
          result: evaluation.formatted,
          qty: storedQty,
          varName: assignedName,
        },
        ...prev.slice(0, 29),
      ]);
      lastCommittedExprRef.current = resultTrimmed;
      setExpression(evaluation.formatted);
      setIsVarPickerOpen(false);
    }
  };

  const handleGestureStart = (clientY) => {
    if (typeof clientY !== 'number') return;
    gestureStartY.current = clientY;
    didDragRef.current = false;
  };

  const handleGestureMove = (clientY) => {
    if (gestureStartY.current === null || typeof clientY !== 'number') return;
    const deltaY = clientY - gestureStartY.current;
    if (Math.abs(deltaY) > 6) {
      didDragRef.current = true;
    }
    if (!isTapeOpen && deltaY < 0) {
      setDragOffsetY(Math.max(deltaY, -420));
    } else if (isTapeOpen && deltaY > 0) {
      setDragOffsetY(Math.min(deltaY, 420));
    }
  };

  const handleGestureEnd = (clientY) => {
    if (gestureStartY.current === null) return;
    const endY = typeof clientY === 'number' ? clientY : gestureStartY.current;
    const deltaY = endY - gestureStartY.current;

    if (!isTapeOpen && deltaY < -35) {
      setIsTapeOpen(true);
    } else if (isTapeOpen && deltaY > 35) {
      setIsTapeOpen(false);
    }
    gestureStartY.current = null;
    setDragOffsetY(0);
  };

  const drawerStyle =
    dragOffsetY !== 0
      ? {
          transform: isTapeOpen
            ? `translateY(${Math.max(0, dragOffsetY)}px)`
            : `translateY(calc(100% - 2.875rem + ${dragOffsetY}px))`,
          transition: 'none',
        }
      : undefined;

  return (
    <div className="calc-stage">
      <div className="calc-main-scroll">
        {/* Base Unit & Fractional Precision Selector */}
        <div className="settings-bar">
          <div className="setting-group">
            <span className="setting-label">Target Base Unit</span>
            <div className="pill-row">
              {BASE_UNITS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`pill-btn ${baseUnit === u.id ? 'active' : ''}`}
                  onClick={() => setBaseUnit(u.id)}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-group">
            <span className="setting-label">Snap To</span>
            <select
              aria-label="Fraction Precision"
              className="select-input"
              value={precision}
              onChange={(e) => setPrecision(Number(e.target.value))}
            >
              {PRECISIONS.map((p) => (
                <option key={p} value={p}>
                  1/{p}"
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main Live Calculator Display with Inline Variable Slot Pill */}
        <div className="display-card">
          <div className="expr-row">
            <input
              type="text"
              aria-label="Measurement Expression"
              className="expr-input"
              value={expression}
              onChange={(e) => {
                lastCommittedExprRef.current = null;
                setShowCommitError(false);
                setExpression(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEvaluateCommit();
              }}
              placeholder="Tap numbers, Pick Var, or type kerf = 1/8"
            />
            <button
              type="button"
              className={`inline-var-slot-pill ${expectsOperand ? 'ready' : ''} ${
                isVarPickerOpen ? 'open' : ''
              }`}
              onClick={() => setIsVarPickerOpen((prev) => !prev)}
              title="Pick or set a named variable"
            >
              <span>🏷️ {expectsOperand ? 'Pick Var' : 'Var'}</span>
              <span style={{ fontSize: '0.62rem', opacity: 0.8 }}>▾</span>
            </button>
          </div>

          {/* Popover when clicking the empty Variable Pill in the display */}
          {isVarPickerOpen && (
            <div className="var-picker-popover">
              <div className="var-popover-section">
                <div className="var-popover-header">
                  <span>Insert Variable at Cursor</span>
                  <button
                    type="button"
                    className="popover-close-btn"
                    onClick={() => setIsVarPickerOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                {formattedVariablesList.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    No variables saved yet. Set one below or name an item in Notes.
                  </div>
                ) : (
                  <div className="pill-row">
                    {formattedVariablesList.map((v) => (
                      <button
                        key={v.name}
                        type="button"
                        className="saved-var-chip"
                        onClick={() => insertVariableIntoExpression(v.name)}
                      >
                        <span className="saved-var-name">{v.name}</span>
                        <span className="saved-var-val">{v.liveFormatted}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="var-popover-section">
                <div className="var-popover-header">
                  <span>Set Variable (e.g. Kerf = 1/8)</span>
                </div>
                <div className="pill-row">
                  {VAR_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="pill-btn"
                      onClick={() => startVariableAssignment(preset)}
                    >
                      {preset} =
                    </button>
                  ))}
                </div>
                <div className="custom-var-row">
                  <input
                    type="text"
                    className="text-input custom-var-input"
                    placeholder="Custom name or e.g. kerf = 1/8"
                    value={customAssignInput}
                    onChange={(e) => setCustomAssignInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customAssignInput.trim()) {
                        if (customAssignInput.includes('=')) {
                          setExpression(customAssignInput.trim());
                          setCustomAssignInput('');
                          setIsVarPickerOpen(false);
                        } else {
                          startVariableAssignment(customAssignInput);
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="pill-btn active"
                    onClick={() => {
                      if (!customAssignInput.trim()) return;
                      if (customAssignInput.includes('=')) {
                        setExpression(customAssignInput.trim());
                        setCustomAssignInput('');
                        setIsVarPickerOpen(false);
                      } else {
                        startVariableAssignment(customAssignInput);
                      }
                    }}
                  >
                    Set =
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="result-main" data-testid="calc-result">
            {!evaluation.ok && showCommitError ? (
              <span style={{ fontSize: '1.05rem', color: 'var(--text-muted)' }}>
                ⋯ {evaluation.error}
              </span>
            ) : (
              <>
                {displayedEval.assignedVar && (
                  <span className="assign-preview-tag">
                    {displayedEval.assignedVar} ←{' '}
                  </span>
                )}
                {displayedEval.isApproximate ? '~ ' : ''}
                {displayedEval.formatted}
              </>
            )}
          </div>

          <div className="result-sub">
            <span>
              {!evaluation.ok && showCommitError
                ? 'Complete the expression or tap ⌫'
                : displayedEval.assignedVar
                ? `Tap = to save [${displayedEval.assignedVar}] (${displayedEval.exactDec})`
                : `Exact: ${displayedEval.exactDec}`}
            </span>
            {displayedEval.isApproximate && (
              <span className="approx-badge">Rounded to 1/{precision}"</span>
            )}
          </div>

          {displayedEval.allConversions && (
            <div className="conversions-strip">
              <span>{displayedEval.allConversions.fracIn}</span>
              <span>•</span>
              <span>{displayedEval.allConversions.ftIn}</span>
              <span>•</span>
              <span>{displayedEval.allConversions.mm}</span>
              <span>•</span>
              <span>{displayedEval.allConversions.cm}</span>
            </div>
          )}
        </div>

        {/* Dedicated Woodworker Fraction Keys */}
        <div className="fraction-bar">
          {QUICK_FRACTIONS.map((frac) => (
            <button
              key={frac}
              type="button"
              className="frac-key"
              onClick={() => appendToken(frac)}
            >
              {frac}
            </button>
          ))}
        </div>

        {/* Unit Input Bar */}
        <div className="unit-bar">
          {UNITS.map((u) => (
            <button
              key={u.label}
              type="button"
              className="unit-key"
              onClick={() => appendToken(u.token)}
            >
              {u.label}
            </button>
          ))}
        </div>

        {/* Main Number & Operator Keypad */}
        <div className="keypad-grid">
          <button type="button" className="calc-key danger" onClick={handleClear}>
            C
          </button>
          <button type="button" className="calc-key" onClick={() => appendToken('(')}>
            (
          </button>
          <button type="button" className="calc-key" onClick={() => appendToken(')')}>
            )
          </button>
          <button type="button" className="calc-key op" onClick={handleBackspace}>
            ⌫
          </button>

          <button type="button" className="calc-key" onClick={() => appendToken('7')}>
            7
          </button>
          <button type="button" className="calc-key" onClick={() => appendToken('8')}>
            8
          </button>
          <button type="button" className="calc-key" onClick={() => appendToken('9')}>
            9
          </button>
          <button type="button" className="calc-key op" onClick={() => appendToken(' / ')}>
            ÷
          </button>

          <button type="button" className="calc-key" onClick={() => appendToken('4')}>
            4
          </button>
          <button type="button" className="calc-key" onClick={() => appendToken('5')}>
            5
          </button>
          <button type="button" className="calc-key" onClick={() => appendToken('6')}>
            6
          </button>
          <button type="button" className="calc-key op" onClick={() => appendToken(' * ')}>
            ×
          </button>

          <button type="button" className="calc-key" onClick={() => appendToken('1')}>
            1
          </button>
          <button type="button" className="calc-key" onClick={() => appendToken('2')}>
            2
          </button>
          <button type="button" className="calc-key" onClick={() => appendToken('3')}>
            3
          </button>
          <button type="button" className="calc-key op" onClick={() => appendToken(' - ')}>
            −
          </button>

          <button
            type="button"
            className="calc-key"
            style={{ gridColumn: 'span 2' }}
            onClick={() => appendToken('0')}
          >
            0
          </button>
          <button type="button" className="calc-key" onClick={() => appendToken('.')}>
            .
          </button>
          <button type="button" className="calc-key op" onClick={() => appendToken(' + ')}>
            +
          </button>

          <button
            type="button"
            className="calc-key"
            style={{ gridColumn: 'span 2' }}
            onClick={() => appendToken(' ')}
          >
            and
          </button>
          <button type="button" className="calc-key" onClick={() => appendToken('/')}>
            by
          </button>
          <button
            type="button"
            className="calc-key equal"
            onClick={handleEvaluateCommit}
          >
            =
          </button>
        </div>
      </div>

      {/* Unified Docked Bottom Sheet for Notes */}
      <div
        className={`cutlist-drawer ${isTapeOpen ? 'open' : ''}`}
        style={drawerStyle}
      >
        <div
          className="drawer-handle-lip"
          onTouchStart={(e) => handleGestureStart(e.touches[0]?.clientY)}
          onTouchMove={(e) => handleGestureMove(e.touches[0]?.clientY)}
          onTouchEnd={(e) => handleGestureEnd(e.changedTouches[0]?.clientY)}
          onMouseDown={(e) => handleGestureStart(e.clientY)}
          onMouseMove={(e) => handleGestureMove(e.clientY)}
          onMouseUp={(e) => handleGestureEnd(e.clientY)}
          onClick={() => {
            if (!didDragRef.current) {
              setIsTapeOpen((prev) => !prev);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={
            isTapeOpen
              ? 'Swipe down to close Notes'
              : 'Swipe up to open Notes'
          }
        >
          <div className="grabber-pill" />
          <div className="drawer-lip-row">
            <span className="drawer-lip-title">
              Notes <span className="drawer-count-badge">{history.length}</span>
            </span>
            {!isTapeOpen && history[0] ? (
              <span className="tape-latest-preview">
                Latest: {history[0].varName ? `[${history[0].varName}] ` : ''}
                {history[0].result}
              </span>
            ) : (
              <span className="drawer-hint">
                {isTapeOpen ? 'Swipe down to close' : 'Swipe up to open'}
              </span>
            )}
          </div>
        </div>

        <div className="drawer-body">
          <div className="drawer-Subheader">
            <span>Tap an item to use it • Tap 🏷️ Name to assign a variable</span>
            {history.length > 0 && (
              <button
                type="button"
                className="pill-btn"
                onClick={() => setHistory([])}
              >
                Clear All
              </button>
            )}
          </div>

          <div className="sheet-list">
            {history.length === 0 ? (
              <div className="empty-tape">
                No saved notes yet. Tap <strong>=</strong> on the calculator to save measurements to Notes.
              </div>
            ) : (
              history.map((item, idx) => {
                const isNaming = namingItemId === item.id;
                return (
                  <div key={item.id || idx} className="sheet-item-card">
                    <div
                      className="sheet-item"
                      onClick={() => {
                        if (item.varName) {
                          insertVariableIntoExpression(item.varName);
                        } else {
                          setExpression(item.expr);
                        }
                        setIsTapeOpen(false);
                      }}
                    >
                      <div className="sheet-item-index">#{history.length - idx}</div>
                      <div className="sheet-item-body">
                        <div>
                          <div className="sheet-item-expr">{item.expr}</div>
                          {item.varName && (
                            <span className="var-assigned-pill">
                              🏷️ {item.varName}
                            </span>
                          )}
                        </div>
                        <div className="sheet-item-res">= {item.result}</div>
                      </div>
                      <div className="sheet-item-actions">
                        <button
                          type="button"
                          className={`name-item-btn ${item.varName ? 'named' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setNamingItemId(isNaming ? null : item.id);
                            setCustomTapeName(item.varName || '');
                          }}
                        >
                          {item.varName ? 'Rename' : '🏷️ Name'}
                        </button>
                        <button
                          type="button"
                          className="delete-item-btn"
                          aria-label="Delete note"
                          title="Delete note"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteHistoryItem(item.id);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Part 1 Option 1: One-tap Woodworking Presets + Custom Name Input */}
                    {isNaming && (
                      <div className="tape-naming-panel">
                        <div className="setting-label">
                          Assign Variable Name (One-Tap Preset or Custom)
                        </div>
                        <div className="pill-row">
                          {VAR_PRESETS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className={`pill-btn ${
                                item.varName === preset ? 'active' : ''
                              }`}
                              onClick={() =>
                                assignVariableToHistoryItem(item.id, preset)
                              }
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                        <div className="custom-var-row">
                          <input
                            type="text"
                            className="text-input custom-var-input"
                            placeholder="Custom variable name (e.g. ShelfSpan)"
                            value={customTapeName}
                            onChange={(e) => setCustomTapeName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && customTapeName.trim()) {
                                assignVariableToHistoryItem(
                                  item.id,
                                  customTapeName
                                );
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="pill-btn active"
                            onClick={() =>
                              assignVariableToHistoryItem(item.id, customTapeName)
                            }
                          >
                            Save Name
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
