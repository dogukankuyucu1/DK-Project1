import React, { useEffect, useRef, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const MONTHS = [
  { key: "2025-09", label: "Eyl 25", names: ["eyl", "eylül", "eylul"] },
  { key: "2025-10", label: "Eki 25", names: ["eki", "ekim"] },
  { key: "2025-11", label: "Kas 25", names: ["kas", "kasım", "kasim"] },
  { key: "2025-12", label: "Ara 25", names: ["ara", "aralık", "aralik"] },
  { key: "2026-01", label: "Oca 26", names: ["oca", "ocak"] },
  { key: "2026-02", label: "Şub 26", names: ["sub", "şub", "şubat", "subat"] },
  { key: "2026-03", label: "Mar 26", names: ["mar", "mart"] },
  { key: "2026-04", label: "Nis 26", names: ["nis", "nisan"] },
  { key: "2026-05", label: "May 26", names: ["may", "mayıs", "mayis"] },
  { key: "2026-06", label: "Haz 26", names: ["haz", "haziran"] },
  { key: "2026-07", label: "Tem 26", names: ["tem", "temmuz"] },
  { key: "2026-08", label: "Ağu 26", names: ["agu", "ağu", "ağustos", "agustos"] },
  { key: "2026-09", label: "Eyl 26", names: ["eyl", "eylül", "eylul"] },
];

function blankPayments(): Record<string, boolean> {
  return Object.fromEntries(MONTHS.map((m) => [m.key, false]));
}

function normalizeTr(s: string) {
  return s
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c");
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

interface AthleteRow {
  id: string;
  list_id: string;
  name: string;
  payments: Record<string, boolean>;
  created_at?: string;
}
interface ListRow {
  id: string;
  name: string;
  created_at?: string;
}

const LS_CACHE = "odeme-takip-cache-v2";
