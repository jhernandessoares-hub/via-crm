"use client";

import { useState } from "react";

const CATEGORIES: { key: string; icon: string; label: string; emojis: string[] }[] = [
  {
    key: "rostos",
    icon: "😀",
    label: "Rostos",
    emojis: [
      "😀","😃","😄","😁","😆","😅","😂","🤣","😊","🙂","😉","😍","🥰","😘","😗","😋",
      "😎","🤩","🥳","🤗","🤔","🤨","😐","😑","😶","🙄","😏","😴","😌","😔","😪","🤤",
      "😮","😯","😲","😳","🥺","😢","😭","😤","😠","😡","🤬","😱","😨","😰","😓","🤯",
      "🤑","🤫","🤭","🧐","🤓","😇","🙃","😬","🤐","😷","🤒","🤕","🥵","🥶","🤠","🥱",
    ],
  },
  {
    key: "maos",
    icon: "🤝",
    label: "Mãos",
    emojis: [
      "👍","👎","👌","🤌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋","🤚",
      "🖐️","🖖","👋","🤝","🙌","👏","🫶","🙏","💪","✍️","🤳","👐","🤲","🫰","🫵","🫡",
    ],
  },
  {
    key: "dinheiro",
    icon: "💰",
    label: "Dinheiro",
    emojis: [
      "💰","💵","💸","🤑","💲","💳","🪙","💴","💶","💷","🏦","🧾","📈","📉","📊","🏷️",
    ],
  },
  {
    key: "imoveis",
    icon: "🏠",
    label: "Imóveis",
    emojis: [
      "🏠","🏡","🏢","🏘️","🏗️","🏬","🏙️","🌆","🌇","🛋️","🛏️","🚿","🛁","🚗","🅿️","🌳",
      "🌴","🏊","🔑","🗝️","🚪","🪟","📍","🗺️","📐","📏","📝","📄","📑","📋","✍️","🖊️",
      "📞","📱","💬","📧","📅","⏰","⌛","🕐","📌","📎","🔔","📸","🎥","📷","🔍","👀",
    ],
  },
  {
    key: "coracoes",
    icon: "❤️",
    label: "Corações",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","💕","💞","💓","💗","💖",
      "💘","💝","💟","🔥","✨","🎉","🎊","🎁","🏆","🥇","⭐","🌟","💯","🎯","🚀","☀️",
    ],
  },
  {
    key: "simbolos",
    icon: "✅",
    label: "Símbolos",
    emojis: [
      "✅","☑️","✔️","❌","❎","⚠️","❗","❓","‼️","⁉️","➕","➖","➡️","⬅️","⬆️","⬇️",
      "🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🆗","🆕","🔝","🔜","🆓","🔒","🔓","🤷",
    ],
  },
];

export default function EmojiPicker({
  onSelect,
  onClose,
  className = "absolute bottom-12 left-0 z-20",
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const [tab, setTab] = useState(CATEGORIES[0].key);
  const current = CATEGORIES.find((c) => c.key === tab) ?? CATEGORIES[0];

  return (
    <div className={`${className} w-72 rounded-lg border bg-[var(--shell-card-bg)] shadow p-2`}>
      <div className="flex gap-1 mb-2 border-b pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            title={c.label}
            onClick={() => setTab(c.key)}
            className={`h-8 flex-1 rounded-md text-base hover:bg-[var(--shell-bg)] ${
              c.key === tab ? "bg-[var(--shell-bg)]" : ""
            }`}
          >
            {c.icon}
          </button>
        ))}
      </div>

      <div className="text-[11px] text-[var(--shell-subtext)] mb-1">{current.label}</div>
      <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
        {current.emojis.map((em) => (
          <button
            key={em}
            type="button"
            title={em}
            onClick={() => onSelect(em)}
            className="h-8 w-8 rounded-md hover:bg-[var(--shell-bg)] text-lg"
          >
            {em}
          </button>
        ))}
      </div>

      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className="rounded-md border bg-[var(--shell-card-bg)] px-2 py-1 text-xs hover:bg-[var(--shell-bg)]"
          onClick={onClose}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
