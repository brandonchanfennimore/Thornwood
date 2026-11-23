// Pick one of the four seasonal maps. Each card shows the season's colors and the map's special rule.
import { E, type MapKey } from '../game/engine';
import { boardBg } from '../game/board';

const SEASON: Record<MapKey, string> = { autumn: 'Autumn', spring: 'Spring', summer: 'Summer', winter: 'Winter' };
export function MapPicker({ value, onChange, disabled }: { value: MapKey; onChange(k: MapKey): void; disabled?: boolean }) {
  return (
    <div className="map-grid" role="radiogroup" aria-label="Map">
      {E.MAP_KEYS.map(k => {
        const m = E.MAPS[k];
        return (
          <button key={k} role="radio" aria-checked={value === k} disabled={disabled && value !== k} className={`map-card${value === k ? ' on' : ''}`} onClick={() => onChange(k)}>
            <span className="map-swatch" style={{ background: boardBg(k) }}><span className={`map-season s-${k}`}>{SEASON[k]}</span></span>
            <b>{m.name}</b><small>{m.ruleText}</small>
          </button>
        );
      })}
    </div>
  );
}
