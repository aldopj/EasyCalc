import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useId,
  memo,
} from 'react';
import {
  parseAndEvaluate,
  formatQuantity,
  convertDimensionlessToActiveUnit,
} from '../utils/parser';
import { triggerHaptic } from '../utils/haptics';

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
    triggerHaptic(8);
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
    triggerHaptic(8);
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
        <FastButton className="calc-key" onActivate={() => onAppendToken('(')}>
          (
        </FastButton>
        <FastButton className="calc-key" onActivate={() => onAppendToken(')')}>
          )
        </FastButton>
        <FastButton className="calc-key danger" onActivate={onClear}>
          C
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

export default function Calculator({
  projectName = 'Default Project',
  baseUnit = 'in-fractional',
  precision = 16,
  initialNotes = [],
  initialVariables = {},
  initialFreeflowNotes = '',
  onSaveProjectData,
  onOpenProjectExplorer,
}) {
  const [expression, setExpression] = useState('');

  const [history, setHistory] = useState(() =>
    Array.isArray(initialNotes) ? initialNotes : []
  );
  const [variables, setVariables] = useState(() =>
    initialVariables && typeof initialVariables === 'object'
      ? initialVariables
      : {}
  );
  const [freeflowNotes, setFreeflowNotes] = useState(() =>
    typeof initialFreeflowNotes === 'string' ? initialFreeflowNotes : ''
  );
  const freeflowNotesId = useId();

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

  const lastPersistedRef = useRef(null);
  if (!lastPersistedRef.current) {
    lastPersistedRef.current = { history, variables, freeflowNotes };
  }

  const persistProjectData = useCallback(
    (nextNotes, nextVars, nextFreeflow = freeflowNotes) => {
      lastPersistedRef.current = {
        history: nextNotes,
        variables: nextVars,
        freeflowNotes: nextFreeflow,
      };
      onSaveProjectData?.(nextNotes, nextVars, nextFreeflow);
    },
    [onSaveProjectData, freeflowNotes]
  );

  // Automatically persist notes, variables & free-flow notes whenever they change for the active project
  useEffect(() => {
    if (
      lastPersistedRef.current.history === history &&
      lastPersistedRef.current.variables === variables &&
      lastPersistedRef.current.freeflowNotes === freeflowNotes
    ) {
      return;
    }
    persistProjectData(history, variables, freeflowNotes);
  }, [history, variables, freeflowNotes, persistProjectData]);

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

  const buildAllConversions = useCallback(
    (qty) => {
      if (!qty) {
        return buildAllConversions({ value: 0, dimension: 1 });
      }
      if (qty.dimension === 0 || qty.dimension === 1) {
        const lengthQty =
          qty.dimension === 0
            ? convertDimensionlessToActiveUnit(qty, baseUnit)
            : qty;
        const inches = lengthQty.value;
        const ftIn = formatQuantity(lengthQty, 'ft-in', precision).formatted;
        const fracIn = formatQuantity(
          lengthQty,
          'in-fractional',
          precision
        ).formatted;
        const mm = `${(inches * 25.4).toFixed(1)} mm`;
        const cm = `${(inches * 2.54).toFixed(2)} cm`;
        return { items: [fracIn, ftIn, mm, cm] };
      }
      if (qty.dimension === 2) {
        const val = qty.value;
        return {
          items: [
            `${(val / 144).toFixed(2)} sq ft`,
            `${val.toFixed(1)} sq in`,
            `${(val * 6.4516).toFixed(1)} cm²`,
            `${(val * 0.00064516).toFixed(3)} m²`,
          ],
        };
      }
      if (qty.dimension === 3) {
        const val = qty.value;
        return {
          items: [
            `${(val / 144).toFixed(2)} BF`,
            `${val.toFixed(1)} cu in`,
            `${(val * 16.387064).toFixed(0)} cm³`,
            `${(val * 0.000016387064).toFixed(4)} m³`,
          ],
        };
      }
      return buildAllConversions({ value: 0, dimension: 1 });
    },
    [baseUnit, precision]
  );

  const emptyConversions = useMemo(
    () => buildAllConversions({ value: 0, dimension: 1 }),
    [buildAllConversions]
  );

  const evaluateExpressionString = useCallback(
    (exprStr) => {
      const buildSuccess = (qty) => {
        const fmt = formatQuantity(qty, baseUnit, precision);
        return {
          ok: true,
          qty,
          assignedVar: qty.assignedVar || null,
          ...fmt,
          allConversions: buildAllConversions(qty),
        };
      };

      const emptyState = {
        ok: true,
        formatted: '0"',
        exactDec: '0.0000 in',
        isApproximate: false,
        allConversions: emptyConversions,
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
    [baseUnit, precision, variables, buildAllConversions, emptyConversions]
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
        allConversions: emptyConversions,
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
    triggerHaptic(8);
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
    triggerHaptic(8);
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
      const trimmedEnd = prev.trimEnd();
      if (!trimmedEnd) {
        expressionRef.current = '';
        return '';
      }

      let removed;
      const bracketMatch = trimmedEnd.match(/(\[[^\]]*\]?)$/);
      if (bracketMatch) {
        removed = trimmedEnd.slice(
          0,
          trimmedEnd.length - bracketMatch[1].length
        );
      } else {
        const identMatch = trimmedEnd.match(
          /(^|[^a-zA-Z0-9_])([a-zA-Z_][a-zA-Z0-9_]*)$/
        );
        if (identMatch) {
          removed = trimmedEnd.slice(
            0,
            trimmedEnd.length - identMatch[2].length
          );
        } else {
          removed = trimmedEnd.slice(0, -1);
        }
      }

      const next = removed.trimEnd();
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
    persistProjectData(nextHistory, nextVariables);
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
    persistProjectData(remaining, nextVariables);

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
    const emptyHistory = [];
    setHistory(emptyHistory);
    setVariables(nextVariables);
    persistProjectData(emptyHistory, nextVariables);
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
    persistProjectData(nextHistory, nextVariables);

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
      triggerHaptic(8);
      setIsTapeOpen(true);
    } else if (isTapeOpen && deltaY > 35) {
      triggerHaptic(8);
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
        {/* Main Live Calculator Display with Inline Variable Slot Pill */}
        <div className="display-card">
          <div className="expr-row">
            <input
              type="text"
              readOnly
              inputMode="none"
              aria-label="Measurement Expression"
              className="expr-input"
              value={expression}
              placeholder="Tap numbers, units, or ← Insert"
            />
            <button
              type="button"
              className={`inline-var-slot-pill ${expectsOperand ? 'ready' : ''} ${
                isVarPickerOpen ? 'open' : ''
              }`}
              onClick={() => {
                triggerHaptic(8);
                setIsVarPickerOpen((prev) => !prev);
              }}
              title="Insert variable or set a named variable"
            >
              <span aria-hidden="true">←</span>
              <span>Insert</span>
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
                      triggerHaptic(8);
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
            <span className="result-exact-inline">
              {!evaluation.ok && showCommitError
                ? 'Complete the expression or tap ⌫'
                : displayedEval.assignedVar
                ? `Tap = to save [${displayedEval.assignedVar}] (${displayedEval.exactDec})`
                : `Exact: ${displayedEval.exactDec}`}
            </span>
            <span className="result-main-inner">
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
            </span>
          </div>

          <div className="conversions-strip">
            {displayedEval.allConversions.items.map((item, index) => (
              <React.Fragment key={index}>
                {index > 0 && <span aria-hidden="true">•</span>}
                <span>{item}</span>
              </React.Fragment>
            ))}
          </div>
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
              triggerHaptic(8);
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
              <span>Notes ·</span>
              <span className="drawer-project-name">{projectName}</span>
              <span className="drawer-count-badge">{history.length}</span>
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
            <span className="drawer-subheader-text">
              {projectName} • Tap item to reuse or 🏷️ Name
            </span>
            <div className="drawer-subheader-actions">
              {onOpenProjectExplorer && (
                <button
                  type="button"
                  className="pill-btn"
                  onClick={onOpenProjectExplorer}
                >
                  Projects
                </button>
              )}
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
          </div>

          <div className="sheet-list">
            {history.length === 0 ? (
              <div className="empty-tape">
                No saved notes in <strong>{projectName}</strong> yet. Tap <strong>=</strong> on the calculator to save measurements to this project.
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

          <div className="freeflow-notes-section">
            <label htmlFor={freeflowNotesId} className="freeflow-notes-label">
              Free-Flow Notes
            </label>
            <textarea
              id={freeflowNotesId}
              className="text-input freeflow-notes-textarea"
              value={freeflowNotes}
              onChange={(e) => setFreeflowNotes(e.target.value)}
              placeholder="Jot down rough measurements, lumber notes, or reminders..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
