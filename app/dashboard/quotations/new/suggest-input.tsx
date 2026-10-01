"use client";

import { useState } from "react";

/**
 * A text input that suggests saved records as you type (a combobox). Arrow
 * keys move through the suggestions, Enter picks one, Escape closes the list.
 */
export function SuggestInput<T extends { id: string }>({
  id,
  value,
  suggestions,
  label,
  className,
  placeholder,
  onChange,
  onPick,
  renderSuggestion,
  isExact,
}: {
  id: string;
  value: string;
  /** Already filtered to what's typed. */
  suggestions: T[];
  /** Accessible name of the list, e.g. "Saved customers". */
  label: string;
  className: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onPick: (record: T) => void;
  renderSuggestion: (record: T) => React.ReactNode;
  /** Whether a record is exactly what's typed; the list hides when that's the only suggestion. */
  isExact: (record: T) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const showList = open && suggestions.length > 0 && !(suggestions.length === 1 && isExact(suggestions[0]));
  const activeIndex = Math.min(active, suggestions.length - 1);
  const listId = `${id}-suggestions`;

  function pick(record: T) {
    setOpen(false);
    onPick(record);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((activeIndex + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((activeIndex - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter") {
            e.preventDefault(); // don't submit the form
            pick(suggestions[activeIndex]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={className}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-[8px] border border-line bg-paper py-1 shadow-[0_6px_20px_rgba(0,0,0,0.12)]"
        >
          {suggestions.map((record, i) => (
            <li
              key={record.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              // mousedown, so the input doesn't lose focus (and close the list) first
              onMouseDown={(e) => {
                e.preventDefault();
                pick(record);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === activeIndex ? "bg-brand-soft" : ""}`}
            >
              {renderSuggestion(record)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
