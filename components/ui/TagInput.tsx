"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
}

export default function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter...",
  maxTags = 30,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || value.includes(trimmed) || value.length >= maxTags) return;
    onChange([...value, trimmed]);
    setInput("");
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value.length - 1);
    }
  };

  return (
    <div
      data-slot="tag-input"
      className="flex min-h-11 cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card p-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-full bg-primary py-0.5 pr-1 pl-2.5 text-[0.8125rem] font-medium text-primary-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(i);
            }}
            aria-label={`Remove ${tag}`}
            className="flex size-6 items-center justify-center rounded-full text-primary-foreground/80 outline-none hover:bg-white/15 hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => { if (input) addTag(input); }}
        placeholder={value.length === 0 ? placeholder : ""}
        className="h-8 min-w-32 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
      />
    </div>
  );
}
