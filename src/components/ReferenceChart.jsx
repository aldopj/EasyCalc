import React, { useState, useMemo } from 'react';

export default function ReferenceChart() {
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => {
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const list = [];
    for (let i = 1; i <= 64; i++) {
      const g = gcd(i, 64);
      const num = i / g;
      const den = 64 / g;
      const dec = i / 64;
      const mm = dec * 25.4;
      list.push({
        fraction: i === 64 ? '1"' : `${num}/${den}"`,
        den,
        decimal: dec.toFixed(4) + '"',
        mm: mm.toFixed(2) + ' mm',
      });
    }
    return list;
  }, []);

  const filtered = rows.filter(
    (r) =>
      r.fraction.includes(filter.trim()) ||
      r.decimal.includes(filter.trim()) ||
      r.mm.includes(filter.trim())
  );

  return (
    <div className="panel-card fill-height">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.05rem', color: 'var(--wood-light)' }}>
          Shop Fraction & Metric Chart
        </h2>
        <input
          type="text"
          className="text-input"
          style={{ width: '150px', padding: '6px 10px', fontSize: '0.85rem' }}
          placeholder="Search (e.g. 3/8)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="ref-table-container">
        <table className="ref-table">
          <thead>
            <tr>
              <th>Fraction</th>
              <th>Decimal (in)</th>
              <th>Metric (mm)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.fraction}>
                <td style={{ fontWeight: 700, color: 'var(--wood-light)' }}>
                  {row.fraction}
                </td>
                <td>{row.decimal}</td>
                <td style={{ color: '#38bdf8' }}>{row.mm}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
