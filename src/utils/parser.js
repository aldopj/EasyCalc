const UNIT_TO_INCHES = {
  'in': 1,
  '"': 1,
  'ft': 12,
  '\'': 12,
  'yd': 36,
  'mm': 1 / 25.4,
  'cm': 10 / 25.4,
  'm': 1000 / 25.4
};

function normalizeUnit(u) {
  if (!u) return null;
  const clean = u.toLowerCase().trim();
  if (clean === '"' || clean === 'in' || clean === 'inch' || clean === 'inches') return 'in';
  if (clean === '\'' || clean === 'ft' || clean === 'foot' || clean === 'feet') return 'ft';
  if (clean === 'mm' || clean === 'millimeter' || clean === 'millimeters') return 'mm';
  if (clean === 'cm' || clean === 'centimeter' || clean === 'centimeters') return 'cm';
  if (clean === 'm' || clean === 'meter' || clean === 'meters') return 'm';
  if (clean === 'yd' || clean === 'yard' || clean === 'yards') return 'yd';
  return null;
}

export function tokenize(input, variables = {}) {
  let str = input.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const tokens = [];
  let i = 0;

  while (i < str.length) {
    const char = str[i];

    if (/\s/.test(char)) {
      tokens.push({ type: 'space', value: ' ' });
      i++;
      continue;
    }

    if ('+-*/()'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      i++;
      continue;
    }

    // Check for bracketed variable e.g. [Width] or [kerf]
    if (char === '[') {
      const closeIdx = str.indexOf(']', i + 1);
      if (closeIdx !== -1) {
        const varName = str.slice(i + 1, closeIdx).trim();
        const key = varName.toLowerCase();
        const found = variables[key];
        if (!found) {
          throw new Error(`Unknown variable: ${varName}`);
        }
        tokens.push({
          type: 'variable',
          name: found.name || varName,
          qty: found.qty
        });
        i = closeIdx + 1;
        continue;
      }
    }

    // Punctuation units (" for inches, ' for feet) are always units
    if (char === '"' || char === "'") {
      tokens.push({ type: 'unit', value: char });
      i++;
      continue;
    }

    // Check for word units (must follow a number/fraction and not be part of a longer word)
    const prevNonSpace = [...tokens].reverse().find((t) => t.type !== 'space');
    const canBeUnit =
      prevNonSpace &&
      (prevNonSpace.type === 'number' || prevNonSpace.type === 'fraction');

    if (canBeUnit) {
      let unitMatch = str
        .slice(i)
        .match(/^(in|ft|mm|cm|m|yd|inches|inch|feet|foot|yards|yard)(?![a-zA-Z_])/i);
      if (unitMatch) {
        tokens.push({ type: 'unit', value: unitMatch[0] });
        i += unitMatch[0].length;
        continue;
      }
    }

    // Check for fractions
    let fracMatch = str.slice(i).match(/^(\d+)\/(\d+)/);
    if (fracMatch) {
      const den = parseInt(fracMatch[2], 10);
      if (den === 0) throw new Error('Division by zero in fraction');
      tokens.push({
        type: 'fraction',
        value: fracMatch[0],
        numerator: parseInt(fracMatch[1], 10),
        denominator: den
      });
      i += fracMatch[0].length;
      continue;
    }

    // Check for decimals/integers
    let numMatch = str.slice(i).match(/^(\d*\.\d+|\d+)/);
    if (numMatch) {
      tokens.push({ type: 'number', value: parseFloat(numMatch[0]) });
      i += numMatch[0].length;
      continue;
    }

    // Check for bare identifier variable e.g. kerf, width, stile_1
    let identMatch = str.slice(i).match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (identMatch) {
      const word = identMatch[1];
      const key = word.toLowerCase();
      if (variables[key]) {
        tokens.push({
          type: 'variable',
          name: variables[key].name || word,
          qty: variables[key].qty
        });
        i += word.length;
        continue;
      }
      // Fallback: if it matches a unit name even without preceding number
      if (/^(in|ft|mm|cm|m|yd|inches|inch|feet|foot|yards|yard)$/i.test(word)) {
        tokens.push({ type: 'unit', value: word });
        i += word.length;
        continue;
      }
      throw new Error(`Unknown variable "${word}"`);
    }

    i++;
  }

  const cleanTokens = [];
  for (let j = 0; j < tokens.length; j++) {
    const tok = tokens[j];

    if (tok.type === 'space') {
      continue;
    }

    if (tok.type === 'fraction') {
      const prev = cleanTokens[cleanTokens.length - 1];
      if (prev && prev.type === 'number' && !prev.isMixed) {
        prev.value = prev.value + (tok.numerator / tok.denominator);
        prev.isMixed = true;
        continue;
      } else {
        cleanTokens.push({ type: 'number', value: tok.numerator / tok.denominator });
        continue;
      }
    }

    cleanTokens.push(tok);
  }

  return cleanTokens;
}

export function processTokens(tokens) {
  const processed = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.type === 'variable') {
      processed.push({
        type: 'quantity',
        value: tok.qty.value,
        dimension: tok.qty.dimension,
        name: tok.name
      });
    } else if (tok.type === 'number') {
      const next = tokens[i + 1];
      if (next && next.type === 'unit') {
        processed.push({
          type: 'measurement',
          value: tok.value,
          unit: normalizeUnit(next.value)
        });
        i++;
      } else {
        processed.push({
          type: 'dimensionless',
          value: tok.value
        });
      }
    } else {
      processed.push(tok);
    }
  }

  const isValueToken = (t) =>
    t && (t.type === 'measurement' || t.type === 'dimensionless' || t.type === 'quantity');

  const finalTokens = [];
  for (let i = 0; i < processed.length; i++) {
    const cur = processed[i];
    const next = processed[i + 1];

    finalTokens.push(cur);

    if (next) {
      if (cur.type === 'measurement' && (next.type === 'measurement' || next.type === 'dimensionless')) {
        finalTokens.push({ type: 'operator', value: '+' });
      } else if (
        (isValueToken(cur) || cur.value === ')') &&
        (next.value === '(')
      ) {
        finalTokens.push({ type: 'operator', value: '*' });
      } else if (
        (cur.value === ')') &&
        isValueToken(next)
      ) {
        finalTokens.push({ type: 'operator', value: '*' });
      } else if (
        (cur.type === 'dimensionless' || cur.type === 'measurement') &&
        next.type === 'quantity'
      ) {
        finalTokens.push({ type: 'operator', value: '*' });
      }
    }
  }

  return finalTokens;
}

export function shuntingYard(tokens) {
  const outputQueue = [];
  const operatorStack = [];

  const precedence = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    'u-': 3
  };

  const associativity = {
    '+': 'left',
    '-': 'left',
    '*': 'left',
    '/': 'left',
    'u-': 'right'
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (
      token.type === 'measurement' ||
      token.type === 'dimensionless' ||
      token.type === 'quantity'
    ) {
      outputQueue.push(token);
    } else if (token.type === 'operator') {
      if (token.value === '(') {
        operatorStack.push('(');
        continue;
      }
      if (token.value === ')') {
        let foundMatching = false;
        while (operatorStack.length > 0) {
          const op = operatorStack.pop();
          if (op === '(') {
            foundMatching = true;
            break;
          }
          outputQueue.push({ type: 'operator', value: op });
        }
        if (!foundMatching) {
          throw new Error('Mismatched parentheses');
        }
        continue;
      }

      let op = token.value;
      if (op === '-') {
        const prev = tokens[i - 1];
        if (!prev || (prev.type === 'operator' && prev.value !== ')')) {
          op = 'u-';
        }
      }

      while (operatorStack.length > 0) {
        const topOp = operatorStack[operatorStack.length - 1];
        if (topOp === '(') break;

        const pOp = precedence[op];
        const pTop = precedence[topOp];
        const assocOp = associativity[op];

        if (
          (assocOp === 'left' && pOp <= pTop) ||
          (assocOp === 'right' && pOp < pTop)
        ) {
          outputQueue.push({ type: 'operator', value: operatorStack.pop() });
        } else {
          break;
        }
      }

      operatorStack.push(op);
    }
  }

  while (operatorStack.length > 0) {
    const op = operatorStack.pop();
    if (op === '(' || op === ')') {
      throw new Error('Mismatched parentheses');
    }
    outputQueue.push({ type: 'operator', value: op });
  }

  return outputQueue;
}

function toQuantity(token) {
  if (token.type === 'quantity') {
    return { value: token.value, dimension: token.dimension };
  }
  if (token.type === 'dimensionless') {
    return { value: token.value, dimension: 0 };
  } else if (token.type === 'measurement') {
    const factor = UNIT_TO_INCHES[token.unit];
    if (!factor) {
      throw new Error(`Unknown unit: ${token.unit}`);
    }
    return { value: token.value * factor, dimension: 1 };
  }
  return token;
}

export function convertDimensionlessToActiveUnit(qty, activeBaseUnit) {
  if (qty.dimension !== 0) return qty;
  let unit = activeBaseUnit === 'ft-in' ? 'in' : activeBaseUnit;
  if (unit === 'in-fractional' || unit === 'in-decimal') {
    unit = 'in';
  }
  const cleanUnit = normalizeUnit(unit) || 'in';
  const factor = UNIT_TO_INCHES[cleanUnit] || 1;
  return {
    value: qty.value * factor,
    dimension: 1
  };
}

export function evaluateRPN(rpn, activeBaseUnit) {
  const stack = [];

  for (let i = 0; i < rpn.length; i++) {
    const token = rpn[i];

    if (
      token.type === 'measurement' ||
      token.type === 'dimensionless' ||
      token.type === 'quantity'
    ) {
      stack.push(toQuantity(token));
    } else if (token.type === 'operator') {
      const op = token.value;

      if (op === 'u-') {
        const a = stack.pop();
        if (!a) throw new Error('Incomplete expression');
        stack.push({
          value: -a.value,
          dimension: a.dimension
        });
      } else {
        let b = stack.pop();
        let a = stack.pop();
        if (!a || !b) throw new Error('Incomplete expression');

        if (op === '+' || op === '-') {
          if (a.dimension !== b.dimension) {
            if (a.dimension === 0 && b.dimension !== 0) {
              a = convertDimensionlessToActiveUnit(a, activeBaseUnit);
            } else if (b.dimension === 0 && a.dimension !== 0) {
              b = convertDimensionlessToActiveUnit(b, activeBaseUnit);
            } else {
              throw new Error('Cannot add/subtract different dimensions');
            }
          }

          if (op === '+') {
            stack.push({ value: a.value + b.value, dimension: a.dimension });
          } else {
            stack.push({ value: a.value - b.value, dimension: a.dimension });
          }
        } else if (op === '*') {
          stack.push({ value: a.value * b.value, dimension: a.dimension + b.dimension });
        } else if (op === '/') {
          if (b.value === 0) throw new Error('Division by zero');
          stack.push({ value: a.value / b.value, dimension: a.dimension - b.dimension });
        }
      }
    }
  }

  if (stack.length !== 1) {
    throw new Error('Incomplete expression');
  }

  return stack[0];
}

export function parseAndEvaluate(expression, activeBaseUnit, variables = {}) {
  if (!expression || expression.trim() === '') {
    return { value: 0, dimension: 0 };
  }

  // Check for direct variable assignment: e.g. "kerf = 1/8" or "Width = 24 1/2""
  const assignMatch = expression.match(/^\s*([a-zA-Z_][a-zA-Z0-9_\s]*?)\s*=\s*(.*)$/);
  if (assignMatch) {
    const rawName = assignMatch[1].trim().replace(/\s+/g, '_');
    const rhs = assignMatch[2].trim();
    if (!rhs) {
      throw new Error(`Enter value for ${rawName}`);
    }
    const tokens = tokenize(rhs, variables);
    const processed = processTokens(tokens);
    const rpn = shuntingYard(processed);
    let qty = evaluateRPN(rpn, activeBaseUnit);
    // When assigning a bare number/fraction like "kerf = 1/8", promote to active base unit length
    if (qty.dimension === 0) {
      qty = convertDimensionlessToActiveUnit(qty, activeBaseUnit);
    }
    return {
      ...qty,
      assignedVar: rawName,
      rhsExpr: rhs
    };
  }

  const tokens = tokenize(expression, variables);
  const processed = processTokens(tokens);
  const rpn = shuntingYard(processed);
  return evaluateRPN(rpn, activeBaseUnit);
}

function formatDecimal(val) {
  return Number(val.toFixed(4)).toString();
}

function toFractionalInches(val, D) {
  const sign = val < 0 ? '-' : '';
  const absVal = Math.abs(val);

  let integerPart = Math.floor(absVal);
  let decimalPart = absVal - integerPart;

  let numerator = Math.round(decimalPart * D);

  if (numerator === D) {
    integerPart += 1;
    numerator = 0;
  }

  if (numerator === 0) {
    return {
      formatted: `${sign}${integerPart}"`,
      isApproximate: Math.abs(decimalPart) > 0.0001
    };
  }

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const divisor = gcd(numerator, D);
  const simplifiedNumerator = numerator / divisor;
  const simplifiedDenominator = D / divisor;

  const approx = Math.abs(decimalPart - numerator / D) > 0.0001;
  const formattedStr = integerPart === 0
    ? `${sign}${simplifiedNumerator}/${simplifiedDenominator}"`
    : `${sign}${integerPart} ${simplifiedNumerator}/${simplifiedDenominator}"`;

  return {
    formatted: formattedStr,
    isApproximate: approx
  };
}

function toFeetInches(val, D) {
  const sign = val < 0 ? '-' : '';
  const absVal = Math.abs(val);

  let feet = Math.floor(absVal / 12);
  let inches = absVal - feet * 12;

  let integerPart = Math.floor(inches);
  let decimalPart = inches - integerPart;
  let numerator = Math.round(decimalPart * D);

  if (numerator === D) {
    integerPart += 1;
    numerator = 0;
  }

  if (integerPart === 12) {
    feet += 1;
    integerPart = 0;
  }

  let inchesStr = '';
  let approx = false;

  if (numerator === 0) {
    inchesStr = `${integerPart}"`;
    approx = Math.abs(decimalPart) > 0.0001;
  } else {
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const divisor = gcd(numerator, D);
    const simplifiedNumerator = numerator / divisor;
    const simplifiedDenominator = D / divisor;

    inchesStr = integerPart === 0
      ? `${simplifiedNumerator}/${simplifiedDenominator}"`
      : `${integerPart} ${simplifiedNumerator}/${simplifiedDenominator}"`;
    approx = Math.abs(decimalPart - numerator / D) > 0.0001;
  }

  const formattedStr = feet === 0
    ? `${sign}${inchesStr}`
    : `${sign}${feet}' ${inchesStr}`;

  return {
    formatted: formattedStr,
    isApproximate: approx
  };
}

export function formatQuantity(qty, activeBaseUnit, fractionPrecision = 16) {
  const dim = qty.dimension;
  const val = qty.value;

  if (dim === 0) {
    if (activeBaseUnit === 'in-fractional') {
      const res = toFractionalInches(val, fractionPrecision);
      return {
        formatted: res.formatted.replace(/"$/, ''),
        isApproximate: res.isApproximate,
        exactDec: formatDecimal(val),
        unitLabel: ''
      };
    }
    return {
      formatted: formatDecimal(val),
      isApproximate: false,
      exactDec: formatDecimal(val),
      unitLabel: ''
    };
  }

  if (dim === 1) {
    if (activeBaseUnit === 'in-fractional') {
      const res = toFractionalInches(val, fractionPrecision);
      return {
        formatted: res.formatted,
        isApproximate: res.isApproximate,
        exactDec: `${val.toFixed(4)} in`,
        unitLabel: 'in'
      };
    } else if (activeBaseUnit === 'in-decimal') {
      return {
        formatted: `${val.toFixed(4)}"`,
        isApproximate: false,
        exactDec: `${val.toFixed(4)} in`,
        unitLabel: 'in'
      };
    } else if (activeBaseUnit === 'ft-in') {
      const res = toFeetInches(val, fractionPrecision);
      return {
        formatted: res.formatted,
        isApproximate: res.isApproximate,
        exactDec: `${(val / 12).toFixed(4)} ft (${val.toFixed(4)} in)`,
        unitLabel: 'ft-in'
      };
    } else if (activeBaseUnit === 'mm') {
      const mmVal = val * 25.4;
      return {
        formatted: `${mmVal.toFixed(1)} mm`,
        isApproximate: false,
        exactDec: `${mmVal.toFixed(4)} mm`,
        unitLabel: 'mm'
      };
    } else if (activeBaseUnit === 'cm') {
      const cmVal = val * 2.54;
      return {
        formatted: `${cmVal.toFixed(2)} cm`,
        isApproximate: false,
        exactDec: `${cmVal.toFixed(4)} cm`,
        unitLabel: 'cm'
      };
    } else if (activeBaseUnit === 'm') {
      const mVal = val * 0.0254;
      return {
        formatted: `${mVal.toFixed(3)} m`,
        isApproximate: false,
        exactDec: `${mVal.toFixed(6)} m`,
        unitLabel: 'm'
      };
    }
  }

  if (dim === 2) {
    if (activeBaseUnit === 'mm') {
      const sqMm = val * 645.16;
      return { formatted: `${sqMm.toFixed(1)} mm²`, isApproximate: false, exactDec: `${sqMm.toFixed(2)} mm²` };
    } else if (activeBaseUnit === 'cm') {
      const sqCm = val * 6.4516;
      return { formatted: `${sqCm.toFixed(2)} cm²`, isApproximate: false, exactDec: `${sqCm.toFixed(4)} cm²` };
    } else if (activeBaseUnit === 'm') {
      const sqM = val * 0.00064516;
      return { formatted: `${sqM.toFixed(4)} m²`, isApproximate: false, exactDec: `${sqM.toFixed(6)} m²` };
    } else {
      const sqIn = val.toFixed(2);
      const sqFt = (val / 144).toFixed(2);
      return {
        formatted: `${sqFt} sq ft (${sqIn} sq in)`,
        isApproximate: false,
        exactDec: `${sqFt} sq ft`
      };
    }
  }

  if (dim === 3) {
    if (activeBaseUnit === 'mm') {
      const cuMm = val * 16387.064;
      return { formatted: `${cuMm.toFixed(0)} mm³`, isApproximate: false, exactDec: `${cuMm.toFixed(0)} mm³` };
    } else if (activeBaseUnit === 'cm') {
      const cuCm = val * 16.387064;
      return { formatted: `${cuCm.toFixed(1)} cm³`, isApproximate: false, exactDec: `${cuCm.toFixed(3)} cm³` };
    } else if (activeBaseUnit === 'm') {
      const cuM = val * 0.000016387064;
      return { formatted: `${cuM.toFixed(5)} m³`, isApproximate: false, exactDec: `${cuM.toFixed(7)} m³` };
    } else {
      const bf = val / 144;
      return {
        formatted: `${bf.toFixed(2)} BF (${val.toFixed(1)} cu in)`,
        isApproximate: false,
        exactDec: `${bf.toFixed(4)} BF`
      };
    }
  }

  return {
    formatted: `${val.toFixed(4)} (dim: ${dim})`,
    isApproximate: false,
    exactDec: `${val.toFixed(4)}`
  };
}
