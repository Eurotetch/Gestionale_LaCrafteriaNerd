import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { REPORTS } from "@/constants/testIds";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { formatEUR } from "@/lib/utils";

const PIE_COLORS = ["#FFD166", "#F38D9B", "#06D6A0", "#118AB2", "#EF476F", "#FFB774", "#9D7BE3"];

export default function ReportsPage() {
  const { data } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => (await api.get("/reports/overview")).data,
    refetchInterval: 5000,
  });
  const d = data || { revenue_by_month: [], by_technique: [], top_customers: [] };

  return (
    <div data-testid={REPORTS.root} className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-accent font-bold">analytics</div>
        <h1 className="text-3xl sm:text-4xl">Report & Statistiche 📊</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Kpi label="Fatturato totale" value={formatEUR(d.total_revenue || 0)} accent="text-accent"/>
        <Kpi label="Ordini totali" value={d.total_orders || 0} accent="text-primary-foreground"/>
        <Kpi label="Vendite alla cassa" value={d.total_sales || 0} accent="text-secondary"/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="crafteria-card p-6 lg:col-span-2">
          <h2 className="font-extrabold mb-3">Incassi per mese</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.revenue_by_month}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }}/>
                <YAxis tick={{ fontSize: 12 }}/>
                <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ borderRadius: 12, border: "1px solid #E8E2D2" }}/>
                <Bar dataKey="revenue" fill="#FFD166" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="crafteria-card p-6">
          <h2 className="font-extrabold mb-3">Per tecnica</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={d.by_technique} dataKey="revenue" nameKey="technique" cx="50%" cy="50%" outerRadius={86} innerRadius={42}>
                  {d.by_technique.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={(v) => formatEUR(v)}/>
                <Legend verticalAlign="bottom" height={24}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="crafteria-card p-6">
        <h2 className="font-extrabold mb-3">Top clienti</h2>
        <div className="overflow-x-auto scrollbar-soft">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2">Cliente</th><th className="py-2 text-right">Fatturato</th></tr>
            </thead>
            <tbody>
              {d.top_customers.map((c, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-2 font-semibold">{c.customer}</td>
                  <td className="py-2 text-right font-bold">{formatEUR(c.revenue)}</td>
                </tr>
              ))}
              {d.top_customers.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-muted-foreground">Nessun dato ancora ✨</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const Kpi = ({ label, value, accent = "text-foreground" }) => (
  <div className="crafteria-card p-6">
    <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">{label}</div>
    <div className={`text-3xl font-extrabold mt-1 ${accent}`}>{value}</div>
  </div>
);
