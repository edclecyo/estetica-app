import React from 'react';

export default function Slider({ value = 0, minimumValue = 0, maximumValue = 100, onValueChange, style }: any) {
  return (
    <input
      type="range"
      min={minimumValue}
      max={maximumValue}
      value={value}
      style={style}
      onChange={event => onValueChange?.(Number(event.currentTarget.value))}
    />
  );
}
