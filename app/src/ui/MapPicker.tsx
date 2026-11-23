// Pick one of the four seasonal maps, or Random. Each card shows the season's colors and the map's special rule.
import { E, type MapKey } from '../game/engine';
import { boardBg } from '../game/board';
import type { MapChoice } from '../game/store';

const SEASON: Record<MapKey, string> = { autumn: 'Autumn', spring: 'Spring', summer: 'Summer', winter: 'Winter' };
export function MapPicker({ value, onChange, disabled }: { value: MapChoice; onChange(k: MapChoice): void; disabled?: boolean }) {
  const card = (k: MapChoice, swatch: React.ReactNode, name: string, text: string) => (
    <button key={k} role="radio" aria-checked={value === k} disabled={disabled && value !== k} className={`map-card${value === k ? ' on' : ''}`} onClick={() => onChange(k)}>
      {swatch}<b>{name}</b><small>{text}</small>
    </button>
  );
  return (
    <div className="map-grid" role="radiogroup" aria-label="Map">
      {E.MAP_KEYS.map(k => card(k, <span className="map-swatch" style={{ background: boardBg(k) }}><span className="map-season">{SEASON[k]}</span></span>, E.MAPS[k].name, E.MAPS[k].ruleText))}
      {card('random', <span className="map-swatch random" style={{ background: `linear-gradient(90deg, ${E.MAP_KEYS.map((k, i) => `${boardBg(k)} ${i * 25}% ${(i + 1) * 25}%`).join(', ')})` }}><span className="map-season">?</span></span>, 'Random map', 'One of the four maps, picked when the game starts.')}
    </div>
  );
}
