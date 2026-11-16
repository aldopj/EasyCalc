import React, { useEffect, useId, useRef } from 'react';
import { triggerHaptic } from '../utils/haptics';

export const STORAGE_KEY_SETTINGS = 'easycalc_settings_v1';

export const BASE_UNITS = [
  { id: 'in-fractional', label: 'in (1/x)' },
  { id: 'ft-in', label: 'ft & in' },
  { id: 'in-decimal', label: 'in (dec)' },
  { id: 'mm', label: 'mm' },
  { id: 'cm', label: 'cm' },
  { id: 'm', label: 'm' },
];

export const PRECISIONS = [2, 4, 8, 16, 32, 64];

export function loadSavedSettings() {
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

export default function SettingsDialog({
  isOpen,
  baseUnit,
  precision,
  onChangeBaseUnit,
  onChangePrecision,
  onClose,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const snapSelectId = useId();

  // Sync React isOpen prop with native top-layer <dialog>.showModal() / .close()
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Fallback for browsers without native `closedby="any"` support (e.g. Safari)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) {
      return undefined;
    }

    const handleBackdropClick = (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;

      if (isDialogContent) return;
      dialog.close();
    };

    dialog.addEventListener('click', handleBackdropClick);
    return () => dialog.removeEventListener('click', handleBackdropClick);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      {...({ closedby: 'any' })}
    >
      <div className="settings-dialog-shell">
        <div className="settings-dialog-header">
          <div>
            <h2 id={titleId} className="settings-dialog-title">
              Settings
            </h2>
            <p className="settings-dialog-subtitle">
              Configure target output units and fractional snapping.
            </p>
          </div>
          <button
            type="button"
            className="popover-close-btn settings-dialog-close"
            aria-label="Close Settings"
            onClick={() => {
              triggerHaptic(8);
              dialogRef.current?.close();
            }}
          >
            ✕
          </button>
        </div>

        <div className="settings-dialog-body">
          <div className="setting-group">
            <span className="setting-label">Target Base Unit</span>
            <div className="pill-row">
              {BASE_UNITS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className={`pill-btn ${baseUnit === u.id ? 'active' : ''}`}
                  onClick={() => {
                    triggerHaptic(8);
                    onChangeBaseUnit(u.id);
                  }}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-group">
            <label htmlFor={snapSelectId} className="setting-label">
              Snap To
            </label>
            <select
              id={snapSelectId}
              className="select-input settings-snap-select"
              value={precision}
              onChange={(e) => {
                triggerHaptic(8);
                onChangePrecision(Number(e.target.value));
              }}
            >
              {PRECISIONS.map((p) => (
                <option key={p} value={p}>
                  1/{p}"
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </dialog>
  );
}
