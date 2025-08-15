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
// --- Komut yorumlama yardımcıları ---
function findMonthsFromText(text: string): string[] {
  const n = normalizeTr(text);
  const hits: string[] = [];
  for (const m of MONTHS) if (m.names.some((alias) => n.includes(alias))) hits.push(m.key);
  if (n.includes("tum") && hits.length === 0) return MONTHS.map((m) => m.key);
  return hits;
}
function interpretCommand(raw: string) {
  const n = normalizeTr(raw.trim());
  const isPaid = n.includes("odendi") || n.includes("ödendi");
  const isUnpaid = n.includes("odenmedi") || n.includes("ödenmedi");
  const monthsMentioned = findMonthsFromText(n);
  const allMonths = n.includes("tum") || n.includes("tüm");
  let guessName = n
    .replace(/\b(odendi|ödendi|odenmedi|ödenmedi|ayi|ayı|ayini|ayını|tum|tüm|ve|,|\.)\b/g, " ")
    .trim();
  for (const m of MONTHS) for (const alias of m.names) guessName = guessName.replaceAll(alias, " ");
  guessName = guessName.replace(/\s+/g, " ").trim();
  return {
    isPaid: isPaid && !isUnpaid,
    isUnpaid,
    months: allMonths && monthsMentioned.length === 0 ? MONTHS.map((m) => m.key) : monthsMentioned,
    nameFragment: guessName
  };
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [lists, setLists] = useState<ListRow[]>([]);
  const [activeListId, setActiveListId] = useState<string>("");
  const [athletes, setAthletes] = useState<AthleteRow[]>([]);

  const [search, setSearch] = useState("");
  const [newAthlete, setNewAthlete] = useState("");
  const [newListName, setNewListName] = useState("");
  const [command, setCommand] = useState("");
  const [toast, setToast] = useState<string>("");

  const realtimeSubRef = useRef<any>(null);

  // PWA SW + manifest
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link");
      link.rel = "manifest"; link.href = "/manifest.json"; document.head.appendChild(link);
    }
  }, []);

  // Supabase oturum
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session); setLoading(false);
      supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    };
    init();
  }, []);

  // Listeleri yükle / varsayılan oluştur
  useEffect(() => {
    if (!supabase) return;
    if (!session) {
      const cached = localStorage.getItem(LS_CACHE);
      if (cached) {
        const parsed = JSON.parse(cached);
        setLists(parsed.lists || []); setAthletes(parsed.athletes || []); setActiveListId(parsed.activeListId || "");
      } else { setLists([]); setAthletes([]); setActiveListId(""); }
      return;
    }
    (async () => {
      setError("");
      const { data: listsData, error: e1 } = await supabase.from("lists").select("*").order("created_at", { ascending: true });
      if (e1) { setError(e1.message); return; }
      if (!listsData || listsData.length === 0) {
        const { data: inserted, error: eIns } = await supabase.from("lists").insert({ name: "Ana Liste" }).select("*").single();
        if (eIns) { setError(eIns.message); return; }
        setLists([inserted as any]); setActiveListId((inserted as any).id);
      } else {
        setLists(listsData as any); setActiveListId((prev) => prev || (listsData as any)[0].id);
      }
    })();
  }, [session]);

  // Aktif listedeki sporcular
  useEffect(() => {
    if (!supabase || !session || !activeListId) return;
    (async () => {
      const { data, error: e2 } = await supabase
        .from("athletes").select("*")
        .eq("list_id", activeListId)
        .order("created_at", { ascending: true });
      if (e2) { setError(e2.message); return; }
      setAthletes((data || []) as any);
      localStorage.setItem(LS_CACHE, JSON.stringify({ lists, athletes: data, activeListId }));
    })();
  }, [session, activeListId]);

  // Realtime
  useEffect(() => {
    if (!supabase || !session || !activeListId) return;
    if (realtimeSubRef.current) { supabase.removeChannel(realtimeSubRef.current); realtimeSubRef.current = null; }
    const ch = supabase.channel("rt-athletes")
      .on("postgres_changes", { event: "*", schema: "public", table: "athletes", filter: `list_id=eq.${activeListId}` }, (payload) => {
        setAthletes((prev) => {
          const row = payload.new as AthleteRow;
          if (payload.eventType === "INSERT") return [...prev, row];
          if (payload.eventType === "UPDATE") return prev.map((a) => a.id === row.id ? row : a);
          if (payload.eventType === "DELETE") return prev.filter((a) => a.id !== (payload.old as any).id);
          return prev;
        });
      })
      .subscribe();
    realtimeSubRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [session, activeListId]);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(""), 1500); }

  async function addList() {
    if (!supabase) return;
    const name = newListName.trim(); if (!name) return;
    const { data, error: e } = await supabase.from("lists").insert({ name }).select("*").single();
    if (e) { setError(e.message); return; }
    setLists((prev) => [...prev, data as any]); setActiveListId((data as any).id); setNewListName("");
  }
  async function deleteList(listId: string) {
    if (!supabase) return;
    await supabase.from("lists").delete().eq("id", listId);
    setLists((prev) => prev.filter((l) => l.id !== listId));
    if (activeListId === listId && lists.length) setActiveListId(lists[0]?.id || "");
  }
  async function addAthlete() {
    if (!supabase || !activeListId) return;
    const name = newAthlete.trim(); if (!name) return;
    const exists = athletes.some((a) => normalizeTr(a.name) === normalizeTr(name));
    if (exists) { showToast("Bu isim zaten var."); return; }
    const payload = { id: (crypto as any).randomUUID?.() || Math.random().toString(36).slice(2,9), list_id: activeListId, name, payments: blankPayments() };
    const { data, error: e } = await supabase.from("athletes").insert(payload).select("*").single();
    if (e) { setError(e.message); return; }
    setAthletes((prev) => [...prev, data as any]); setNewAthlete("");
  }
  async function deleteAthlete(athleteId: string) {
    if (!supabase) return;
    await supabase.from("athletes").delete().eq("id", athleteId);
    setAthletes((prev) => prev.filter((a) => a.id !== athleteId));
  }
  async function updatePayments(athleteId: string, updater: (p: Record<string, boolean>) => Record<string, boolean>) {
    if (!supabase) return;
    const target = athletes.find((a) => a.id === athleteId); if (!target) return;
    const next = updater({ ...(target.payments || {}) });
    setAthletes((prev) => prev.map((a) => a.id === athleteId ? { ...a, payments: next } as any : a));
    const { error: e } = await supabase.from("athletes").update({ payments: next }).eq("id", athleteId);
    if (e) { setError(e.message); showToast("Kaydetme hatası"); }
  }
  function togglePayment(athleteId: string, monthKey: string) { updatePayments(athleteId, (p) => ({ ...p, [monthKey]: !p[monthKey] })); }
  function markAllForAthlete(athleteId: string, value: boolean) { updatePayments(athleteId, () => Object.fromEntries(MONTHS.map((m) => [m.key, value])) as any); }

  async function exportCSV(list: ListRow) {
    const headers = ["Sporcu Adı", ...MONTHS.map((m) => m.label)];
    const rows = athletes
      .filter((a) => a.list_id === list.id)
      .map((a) => [a.name, ...MONTHS.map((m) => (a.payments?.[m.key] ? "Ödendi" : "Ödenmedi"))]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${list.name}-odeme-2025e-2026e.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function filteredAthletes() {
    const q = normalizeTr(search);
    return athletes.filter((a) => a.list_id === activeListId && normalizeTr(a.name).includes(q));
  }

  async function handleCommand() {
    const c = command.trim(); if (!c) return;
    const info = interpretCommand(c);
    if (!info.isPaid && !info.isUnpaid) { showToast("Komutta 'ödendi' veya 'ödenmedi' geçmeli."); return; }
    const targetMonths = info.months.length ? info.months : MONTHS.map((m) => m.key);
    const targets = filteredAthletes().filter((a) => normalizeTr(a.name).includes(normalizeTr(info.nameFragment)));
    if (!targets.length) { showToast("Eşleşen sporcu yok."); return; }
    const value = info.isPaid ? true : false;
    await Promise.all(targets.map((t) => updatePayments(t.id, (p) => ({ ...p, ...Object.fromEntries(targetMonths.map((m) => [m, value])) }))));
    setCommand(""); showToast("Güncellendi.");
  }

// (UI kısmı ve AuthScreen bileşeni 3/3 bölümünde gelecek)
  // --- UI (render) ---
  if (!supabase) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="max-w-md w-full space-y-4 text-center">
          <h1 className="text-2xl font-bold">Supabase Ayarlanmadı</h1>
          <p>
            Çalışması için <code>VITE_SUPABASE_URL</code> ve{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> değişkenlerini .env içine yazın.
          </p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen p-6">Yükleniyor…</div>;
  if (!session) return <AuthScreen />;

  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900 p-4 md:p-8">
      <div className="max-w-[1200px] mx-auto grid gap-4">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              Ödeme Takip (2025 Eyl → 2026 Eyl)
            </h1>
            <p className="text-sm text-gray-600">
              Gerçek zamanlı, paylaşımlı tablo. Komut örneği:{" "}
              <span className="font-medium">
                "Doğukan Kuyucu ekim ayı ödendi"
              </span>
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => supabase!.auth.signOut()}
              className="px-3 py-2 rounded-xl bg-white border"
            >
              Çıkış
            </button>
          </div>
        </header>

        {/* Liste seçim / CSV */}
        <div className="flex flex-wrap items-center gap-2">
          {lists.map((l) => (
            <button
              key={l.id}
              onClick={() => setActiveListId(l.id)}
              className={`px-3 py-1.5 rounded-full border ${
                activeListId === l.id ? "bg-black text-white" : "bg-white"
              }`}
            >
              {l.name}
            </button>
          ))}
          {activeListId && (
            <>
              <button
                onClick={() =>
                  exportCSV(lists.find((l) => l.id === activeListId)!)
                }
                className="ml-auto px-3 py-1.5 rounded-full bg-white border"
              >
                CSV İndir
              </button>
              <button
                onClick={async () => {
                  // basit silme
                  await supabase.from("lists").delete().eq("id", activeListId);
                  setLists((prev) => prev.filter((x) => x.id !== activeListId));
                  setActiveListId(lists[0]?.id || "");
                }}
                className="px-3 py-1.5 rounded-full bg-white border hover:bg-red-50"
              >
                Listeyi Sil
              </button>
            </>
          )}
        </div>

        {/* Arama / Ekle / Komut */}
        <div className="grid md:grid-cols-3 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sporcu ara"
            className="px-3 py-2 rounded-xl border bg-white"
          />
          <div className="flex gap-2">
            <input
              value={newAthlete}
              onChange={(e) => setNewAthlete(e.target.value)}
              placeholder="Yeni sporcu adı"
              className="px-3 py-2 rounded-xl border bg-white w-full"
            />
            <button
              onClick={addAthlete}
              className="px-3 py-2 rounded-xl bg-black text-white"
            >
              Ekle
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Komut yaz: 'Doğukan Kuyucu ekim ayı ödendi'"
              className="px-3 py-2 rounded-xl border bg-white w-full"
            />
            <button
              onClick={handleCommand}
              className="px-3 py-2 rounded-xl bg-white border"
            >
              Uygula
            </button>
          </div>
        </div>

        {/* Tablo */}
        <div className="overflow-auto rounded-2xl border bg-white">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-100 z-10">
              <tr>
                <th className="text-left p-3 min-w-[220px]">Sporcu Adı</th>
                {MONTHS.map((m) => (
                  <th
                    key={m.key}
                    className="p-3 text-center whitespace-nowrap"
                  >
                    {m.label}
                  </th>
                ))}
                <th className="p-3 text-center">Toplu</th>
                <th className="p-3 text-center">Sil</th>
              </tr>
            </thead>
            <tbody>
              {athletes
                .filter(
                  (a) =>
                    a.list_id === activeListId &&
                    normalizeTr(a.name).includes(normalizeTr(search))
                )
                .map((a) => (
                  <tr key={a.id} className="border-t hover:bg-gray-50">
                    <td className="p-2 font-medium">{a.name}</td>
                    {MONTHS.map((m) => (
                      <td key={m.key} className="p-1 text-center">
                        <button
                          onClick={() => togglePayment(a.id, m.key)}
                          className={`w-8 h-8 rounded-lg border flex items-center justify-center mx-auto ${
                            a.payments?.[m.key]
                              ? "bg-green-100 border-green-300"
                              : "bg-white"
                          }`}
                        >
                          {a.payments?.[m.key] ? "✅" : "⬜"}
                        </button>
                      </td>
                    ))}
                    <td className="p-1 text-center">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => markAllForAthlete(a.id, true)}
                          className="px-2 py-1 rounded-lg border bg-white"
                        >
                          Tümü ✅
                        </button>
                        <button
                          onClick={() => markAllForAthlete(a.id, false)}
                          className="px-2 py-1 rounded-lg border bg-white"
                        >
                          Temizle
                        </button>
                      </div>
                    </td>
                    <td className="p-1 text-center">
                      <button
                        onClick={() => deleteAthlete(a.id)}
                        className="px-2 py-1 rounded-lg border bg-white hover:bg-red-50"
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Komut örnekleri */}
        <div className="text-xs text-gray-600 leading-relaxed">
          <p className="font-semibold">Komut örnekleri</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <code>Doğukan Kuyucu ekim ayı ödendi</code>
            </li>
            <li>
              <code>Doğukan Kuyucu tüm ocak ve şubat ödendi</code>
            </li>
            <li>
              <code>Ayşe Yılmaz aralık ayı ödenmedi</code>
            </li>
            <li>
              <code>Ali Veli tüm ödendi</code>
            </li>
          </ul>
        </div>

        {toast && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded-full shadow-xl">
            {toast}
          </div>
        )}
        {error && (
          <div className="fixed bottom-16 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-xl">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Giriş ekranı (magic link) ---
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="min-h-screen p-6 flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-2xl border p-6 grid gap-4">
        <h1 className="text-2xl font-bold">Giriş</h1>
        <p className="text-sm text-gray-600">
          E-postanı yaz; gelen bağlantı ile giriş yap.
        </p>
        <form onSubmit={sendLink} className="grid gap-3">
          <input
            type="email"
            required
            placeholder="ornek@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-2 rounded-xl border"
          />
          <button className="px-3 py-2 rounded-xl bg-black text-white">
            Giriş Bağlantısı Gönder
          </button>
        </form>
        {sent && (
          <div className="text-green-700 text-sm">
            Link gönderildi. E-postanı kontrol et.
          </div>
        )}
        {err && <div className="text-red-600 text-sm">{err}</div>}
      </div>
    </div>
  );
}
