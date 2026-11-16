import React, { useState, useMemo, useRef, useEffect, useCallback, memo } from 'react';
import {
  parseAndEvaluate,
  formatQuantity,
  convertDimensionlessToActiveUnit,
} from '../utils/parser';

const STORAGE_KEY_NOTES = 'easycalc_notes_v2';
const STORAGE_KEY_VARIABLES = 'easycalc_variables_v2';
const STORAGE_KEY_SETTINGS = 'easycalc_settings_v1';

const DEFAULT_VARIABLES = {};
const DEFAULT_HISTORY = [];

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Ignore storage read errors
  }
  return null;
}

function loadSavedNotes() {
  try {
    // Remove legacy v1 demo-seeded keys so existing installs start clean
    localStorage.removeItem('easycalc_notes_v1');
    const raw = localStorage.getItem(STORAGE_KEY_NOTES);
    if (raw === null) {
      return DEFAULT_HISTORY;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item) =>
          item &&
          typeof item.expr === 'string' &&
          typeof item.result === 'string' &&
          item.qty &&
          typeof item.qty.value === 'number'
      );
    }
  } catch {
    // Fallback to empty if storage is unavailable or corrupted
  }
  return DEFAULT_HISTORY;
}

function loadSavedVariables(initialNotes) {
  try {
    localStorage.removeItem('easycalc_variables_v1');
    const raw = localStorage.getItem(STORAGE_KEY_VARIABLES);
    let baseVars = DEFAULT_VARIABLES;
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        baseVars = parsed;
      }
    }
    // Ensure any named items in notes are reflected in variables
    const synced = { ...baseVars };
    if (Array.isArray(initialNotes)) {
      for (let i = initialNotes.length - 1; i >= 0; i--) {
        const note = initialNotes[i];
        if (note && note.varName && note.qty) {
          const key = note.varName.toLowerCase();
          synced[key] = {
            name: note.varName,
            qty: note.qty,
            formatted: note.result,
          };
        }
      }
    }
    return synced;
  } catch {
    return DEFAULT_VARIABLES;
  }
}

function persistNotesAndVariables(notes, variables) {
  try {
    if (notes !== undefined) {
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
    }
    if (variables !== undefined) {
      localStorage.setItem(STORAGE_KEY_VARIABLES, JSON.stringify(variables));
    }
  } catch {
    // Ignore quota or private-browsing storage errors
  }
}

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

/**
 * Zero-latency touch button for mobile PWA keypads.
 * Fires immediately on pointerdown so fast multi-finger or rapid-fire typing
 * on Android never drops digits due to touch movement or double-tap heuristics,
 * while ignoring the subsequent synthetic click and preserving keyboard accessibility.
 */
function FastButton({ onActivate, className, style, children, title, ariaLabel }) {
  const lastPointerDownRef = useRef(0);

  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    lastPointerDownRef.current = performance.now();
    e.currentTarget.setAttribute('data-pressed', 'true');
    onActivate(e);
  };

  const clearPressed = (e) => {
    if (e.currentTarget.hasAttribute('data-pressed')) {
      e.currentTarget.removeAttribute('data-pressed');
    }
  };

  const handleClick = (e) => {
    if (
      lastPointerDownRef.current > 0 &&
      performance.now() - lastPointerDownRef.current < 1000
    ) {
      return;
    }
    onActivate(e);
  };

  return (
    <button
      type="button"
      className={className}
      style={style}
      title={title}
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerUp={clearPressed}
      onPointerCancel={clearPressed}
      onPointerLeave={clearPressed}
      onClick={handleClick}
    >
      {children}
    </button>
  );
}

/**
 * Memoized Keypad section so typing digits only updates the display card
 * without re-rendering all 38 keypad buttons on every keystroke.
 */
const CalculatorKeypads = memo(function CalculatorKeypads({
  onAppendToken,
  onClear,
  onBackspace,
  onEvaluateCommit,
}) {
  return (
    <>
      {/* Dedicated Woodworker Fraction Keys */}
      <div className="fraction-bar">
        {QUICK_FRACTIONS.map((frac) => (
          <FastButton
            key={frac}
            className="frac-key"
            onActivate={() => onAppendToken(frac)}
          >
            {frac}
          </FastButton>
        ))}
      </div>

      {/* Unit Input Bar */}
      <div className="unit-bar">
        {UNITS.map((u) => (
          <FastButton
            key={u.label}
            className="unit-key"
            onActivate={() => onAppendToken(u.token)}
          >
            {u.label}
          </FastButton>
        ))}
      </div>

      {/* Main Number & Operator Keypad */}
      <div className="keypad-grid">
        <FastButton className="calc-key danger" onActivate={onClear}>
          C
        </FastButton>
        <FastButton className="calc-key" onActivate={() => onAppendToken('(')}>
          (
        </FastButton>
        <FastButton className="calc-key" onActivate={() => onAppendToken(')')}>
          )
        </FastButton>
        <FastButton className="calc-key op" onActivate={onBackspace}>
          ⌫
        </FastButton>

        <FastButton className="calc-key" onActivate={() => onAppendToken('7')}>
          7
        </FastButton>
        <FastButton className="calc-key" onActivate={() => onAppendToken('8')}>
          8
        </FastButton>
        <FastButton className="calc-key" onActivate={() => onAppendToken('9')}>
          9
        </FastButton>
        <FastButton className="calc-key op" onActivate={() => onAppendToken(' / ')}>
          ÷
        </FastButton>

        <FastButton className="calc-key" onActivate={() => onAppendToken('4')}>
          4
        </FastButton>
        <FastButton className="calc-key" onActivate={() => onAppendToken('5')}>
          5
        </FastButton>
        <FastButton className="calc-key" onActivate={() => onAppendToken('6')}>
          6
        </FastButton>
        <FastButton className="calc-key op" onActivate={() => onAppendToken(' * ')}>
          ×
        </FastButton>

        <FastButton className="calc-key" onActivate={() => onAppendToken('1')}>
          1
        </FastButton>
        <FastButton className="calc-key" onActivate={() => onAppendToken('2')}>
          2
        </FastButton>
        <FastButton className="calc-key" onActivate={() => onAppendToken('3')}>
          3
        </FastButton>
        <FastButton className="calc-key op" onActivate={() => onAppendToken(' - ')}>
          −
        </FastButton>

        <FastButton
          className="calc-key"
          style={{ gridColumn: 'span 2' }}
          onActivate={() => onAppendToken('0')}
        >
          0
        </FastButton>
        <FastButton className="calc-key" onActivate={() => onAppendToken('.')}>
          .
        </FastButton>
        <FastButton className="calc-key op" onActivate={() => onAppendToken(' + ')}>
          +
        </FastButton>

        <FastButton
          className="calc-key"
          style={{ gridColumn: 'span 2' }}
          onActivate={() => onAppendToken(' ')}
        >
          and
        </FastButton>
        <FastButton className="calc-key" onActivate={() => onAppendToken('/')}>
          by
        </FastButton>
        <FastButton className="calc-key equal" onActivate={onEvaluateCommit}>
          =
        </FastButton>
      </div>
    </>
  );
});

export default function Calculator() {
  const [expression, setExpression] = useState('');
  const [baseUnit, setBaseUnit] = useState(
    () => loadSavedSettings()?.baseUnit || 'in-fractional'
  );
  const [precision, setPrecision] = useState(
    () => loadSavedSettings()?.precision || 16
  );

  const [history, setHistory] = useState(() => loadSavedNotes());
  const [variables, setVariables] = useState(() =>
    loadSavedVariables(loadSavedNotes())
  );

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
  const expressionRef = useRef(expression);
  expressionRef.current = expression;

  // Automatically persist notes & variables whenever they change
  useEffect(() => {
    persistNotesAndVariables(history, variables);
  }, [history, variables]);

  // Persist unit & precision settings
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_SETTINGS,
        JSON.stringify({ baseUnit, precision })
      );
    } catch {
      // Ignore storage errors
    }
  }, [baseUnit, precision]);

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

  const evaluateExpressionString = useCallback(
    (exprStr) => {
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

      if (!exprStr.trim()) {
        lastValidEvalRef.current = emptyState;
        return emptyState;
      }
      try {
        const qty = parseAndEvaluate(exprStr, baseUnit, variables);
        const res = buildSuccess(qty);
        lastValidEvalRef.current = res;
        return res;
      } catch (err) {
        let previewEval = lastValidEvalRef.current || emptyState;
        const stripped = exprStr
          .replace(/(\s+\d+\/?\s*|\s*[+\-*/×÷−(]+\s*)$/, '')
          .trim();
        if (stripped && stripped !== exprStr.trim()) {
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
    },
    [baseUnit, precision, variables]
  );

  const evaluation = useMemo(
    () => evaluateExpressionString(expression),
    [expression, evaluateExpressionString]
  );

  const displayedEval = evaluation.ok
    ? evaluation
    : evaluation.preview || {
        formatted: '0"',
        exactDec: '0.0000 in',
        isApproximate: false,
        allConversions: null,
        assignedVar: null,
      };

  const appendToken = useCallback((token) => {
    lastCommittedExprRef.current = null;
    setShowCommitError(false);
    setIsVarPickerOpen(false);
    setExpression((prev) => {
      const next =
        /^\d+\/\d+$/.test(token) && /\d$/.test(prev)
          ? `${prev} ${token}`
          : `${prev}${token}`;
      expressionRef.current = next;
      return next;
    });
  }, []);

  const insertVariableIntoExpression = useCallback((varName) => {
    lastCommittedExprRef.current = null;
    setShowCommitError(false);
    setExpression((prev) => {
      const trimmed = prev.trimEnd();
      let next;
      if (!trimmed) next = `[${varName}]`;
      else if (/[+\-*/=(]$/.test(trimmed)) next = `${trimmed} [${varName}]`;
      else next = `${prev} + [${varName}]`;
      expressionRef.current = next;
      return next;
    });
    setIsVarPickerOpen(false);
  }, []);

  const startVariableAssignment = useCallback((varName) => {
    const clean = varName.trim().replace(/\s+/g, '_');
    if (!clean) return;
    lastCommittedExprRef.current = null;
    setShowCommitError(false);
    setExpression((prev) => {
      const trimmed = prev.trim();
      const next =
        trimmed && !trimmed.includes('=')
          ? `${clean} = ${trimmed}`
          : `${clean} = `;
      expressionRef.current = next;
      return next;
    });
    setCustomAssignInput('');
    setIsVarPickerOpen(false);
  }, []);

  const handleBackspace = useCallback(() => {
    lastCommittedExprRef.current = null;
    setShowCommitError(false);
    setExpression((prev) => {
      const bracketMatch = prev.match(/(\s*\[[^\]]+\]\s*)$/);
      const next = bracketMatch
        ? prev.slice(0, prev.length - bracketMatch[1].length)
        : prev.slice(0, -1);
      expressionRef.current = next;
      return next;
    });
  }, []);

  const handleClear = useCallback(() => {
    lastCommittedExprRef.current = null;
    setShowCommitError(false);
    expressionRef.current = '';
    setExpression('');
    setIsVarPickerOpen(false);
  }, []);

  const assignVariableToHistoryItem = (itemId, rawName) => {
    const cleanName = rawName.trim().replace(/\s+/g, '_');
    if (!cleanName) return;

    const targetItem = history.find((item) => item.id === itemId);
    if (!targetItem) return;

    const oldVarName = targetItem.varName;
    const storedQty =
      targetItem.qty.dimension === 0
        ? convertDimensionlessToActiveUnit(targetItem.qty, baseUnit)
        : targetItem.qty;

    const nextHistory = history.map((item) =>
      item.id === itemId ? { ...item, varName: cleanName } : item
    );

    const nextVariables = { ...variables };
    if (
      oldVarName &&
      oldVarName.toLowerCase() !== cleanName.toLowerCase()
    ) {
      const oldKey = oldVarName.toLowerCase();
      const stillUsed = nextHistory.some(
        (i) => i.varName && i.varName.toLowerCase() === oldKey
      );
      if (!stillUsed) {
        delete nextVariables[oldKey];
      }
    }

    nextVariables[cleanName.toLowerCase()] = {
      name: cleanName,
      qty: storedQty,
      formatted: targetItem.result,
    };

    setHistory(nextHistory);
    setVariables(nextVariables);
    persistNotesAndVariables(nextHistory, nextVariables);
    setNamingItemId(null);
    setCustomTapeName('');
  };

  const deleteHistoryItem = (itemId) => {
    const target = history.find((i) => i.id === itemId);
    const remaining = history.filter((i) => i.id !== itemId);
    let nextVariables = variables;

    if (target && target.varName) {
      const key = target.varName.toLowerCase();
      const stillUsed = remaining.some(
        (i) => i.varName && i.varName.toLowerCase() === key
      );
      if (!stillUsed && variables[key]) {
        nextVariables = { ...variables };
        delete nextVariables[key];
        setVariables(nextVariables);
      }
    }

    setHistory(remaining);
    persistNotesAndVariables(remaining, nextVariables);

    if (namingItemId === itemId) {
      setNamingItemId(null);
    }
    lastCommittedExprRef.current = null;
  };

  const clearAllHistory = () => {
    const nextVariables = { ...variables };
    history.forEach((item) => {
      if (item.varName) {
        delete nextVariables[item.varName.toLowerCase()];
      }
    });
    setHistory([]);
    setVariables(nextVariables);
    persistNotesAndVariables([], nextVariables);
    setNamingItemId(null);
    lastCommittedExprRef.current = null;
  };

  const handleEvaluateCommit = () => {
    const currentExpr = expressionRef.current;
    if (!currentExpr.trim()) return;
    const currentEval =
      currentExpr === expression
        ? evaluation
        : evaluateExpressionString(currentExpr);

    if (!currentEval.ok) {
      setShowCommitError(true);
      return;
    }
    setShowCommitError(false);

    const currentTrimmed = currentExpr.trim();
    const resultTrimmed = currentEval.formatted.trim();

    // Do not add to Notes if hitting '=' again with no change to the expression
    const isUnchangedRepeat =
      lastCommittedExprRef.current === currentTrimmed ||
      (history[0] &&
        (history[0].expr.trim() === currentTrimmed ||
          (history[0].result.trim() === currentTrimmed &&
            !currentEval.assignedVar)));

    if (isUnchangedRepeat) {
      setIsVarPickerOpen(false);
      return;
    }

    const storedQty =
      currentEval.qty.dimension === 0
        ? convertDimensionlessToActiveUnit(currentEval.qty, baseUnit)
        : currentEval.qty;

    const assignedName = currentEval.assignedVar || null;

    let nextVariables = variables;
    if (assignedName) {
      nextVariables = {
        ...variables,
        [assignedName.toLowerCase()]: {
          name: assignedName,
          qty: storedQty,
          formatted: currentEval.formatted,
        },
      };
      setVariables(nextVariables);
    }

    const nextHistory = [
      {
        id: Date.now(),
        expr: currentExpr,
        result: currentEval.formatted,
        qty: storedQty,
        varName: assignedName,
      },
      ...history.slice(0, 199),
    ];

    setHistory(nextHistory);
    persistNotesAndVariables(nextHistory, nextVariables);

    lastCommittedExprRef.current = resultTrimmed;
    expressionRef.current = currentEval.formatted;
    setExpression(currentEval.formatted);
    setIsVarPickerOpen(false);
  };

  const evaluateCommitRef = useRef(handleEvaluateCommit);
  evaluateCommitRef.current = handleEvaluateCommit;

  const stableEvaluateCommit = useCallback(() => {
    evaluateCommitRef.current();
  }, []);

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
                <FastButton
                  key={u.id}
                  className={`pill-btn ${baseUnit === u.id ? 'active' : ''}`}
                  onActivate={() => setBaseUnit(u.id)}
                >
                  {u.label}
                </FastButton>
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
                expressionRef.current = e.target.value;
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
                          const next = customAssignInput.trim();
                          expressionRef.current = next;
                          setExpression(next);
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
                        const next = customAssignInput.trim();
                        expressionRef.current = next;
                        setExpression(next);
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

        {/* Memoized Fast-Response Keypads */}
        <CalculatorKeypads
          onAppendToken={appendToken}
          onClear={handleClear}
          onBackspace={handleBackspace}
          onEvaluateCommit={stableEvaluateCommit}
        />
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
            <span>Auto-saved locally • Tap item to reuse or 🏷️ Name</span>
            {history.length > 0 && (
              <button
                type="button"
                className="pill-btn"
                onClick={clearAllHistory}
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
                          expressionRef.current = item.expr;
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

                    {/* One-tap Woodworking Presets + Custom Name Input */}
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
