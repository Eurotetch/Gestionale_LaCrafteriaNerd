import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { REPORTS } from "@/constants/testIds";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { formatEUR } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TrendingUp, ShoppingBag, ClipboardList, Trophy } from "lucide-react";

const PIE_COLORS = ["#FFD166", "#F38D9B", "#06D6A0", "#118AB2", "#EF476F", "#FFB774", "#9D7BE3"];

export default function ReportsPage() {
  const [showRevenue, setShowRevenue] = useState(false);
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
        <Kpi label="Fatturato totale" value={formatEUR(d.total_revenue || 0)} accent="text-accent"
             onClick={() => setShowRevenue(true)} hint="Clicca per il riassunto completo"/>
        <Kpi label="Ordini totali" value={d.total_orders || 0} accent="text-primary-foreground"/>
        <Kpi label="Vendite alla cassa" value={d.total_sales || 0} accent="text-secondary"/>
      </div>

      <RevenueDetailDialog open={showRevenue} onOpenChange={setShowRevenue} d={d}/>

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

const Kpi = ({ label, value, accent = "text-foreground", onClick, hint }) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick}
         className={`text-left crafteria-card p-6 w-full ${onClick ? "hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer" : ""}`}>
      <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">{label}</div>
      <div className={`text-3xl font-extrabold mt-1 ${accent}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </Tag>
  );
};

function RevenueDetailDialog({ open, onOpenChange, d }) {
  const totalSales = d.total_sales || 0;
  const totalOrders = d.total_orders || 0;
  const avgSale = totalSales > 0 ? (d.total_revenue || 0) / totalSales : 0;
  const topCustomers = d.top_customers || [];
  const maxCustomerRevenue = Math.max(1, ...topCustomers.map((c) => c.revenue || 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📊 Riassunto Fatturato</DialogTitle>
          <DialogDescription>Tutto il quadro economico in un colpo d'occhio</DialogDescription>
        </DialogHeader>

        {/* Big number */}
        <div className="crafteria-card p-6 bg-accent/10 border border-accent/30 text-center">
          <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Fatturato totale</div>
          <div className="text-5xl font-extrabold text-accent mt-1">{formatEUR(d.total_revenue || 0)}</div>
        </div>

        {/* Mini KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MiniKpi icon={ShoppingBag} label="Vendite alla cassa" value={totalSales} color="bg-secondary/20 text-secondary"/>
          <MiniKpi icon={ClipboardList} label="Ordini totali" value={totalOrders} color="bg-primary/20 text-primary-foreground"/>
          <MiniKpi icon={TrendingUp} label="Media per vendita" value={formatEUR(avgSale)} color="bg-accent/15 text-accent"/>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="crafteria-card p-6 lg:col-span-2">
            <h2 className="font-extrabold mb-3">Incassi per mese</h2>
            <div className="h-64">
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
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={d.by_technique} dataKey="revenue" nameKey="technique" cx="50%" cy="50%" outerRadius={76} innerRadius={36}>
                    {d.by_technique.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip formatter={(v) => formatEUR(v)}/>
                  <Legend verticalAlign="bottom" height={24}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Top customers */}
        <div className="crafteria-card p-6">
          <h2 className="font-extrabold mb-3 flex items-center gap-2"><Trophy size={16}/> Top clienti</h2>
          {topCustomers.length === 0 ? (
            <div className="text-center text-muted-foreground py-6">Nessun dato ancora ✨</div>
          ) : (
            <div className="space-y-2">
              {topCustomers.map((c, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold">{c.customer}</span>
                    <span className="font-bold text-accent">{formatEUR(c.revenue)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${((c.revenue || 0) / maxCustomerRevenue) * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length] }}/>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MiniKpi({ icon: Icon, label, value, color }) {
  return (
    <div className="crafteria-card p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-2xl grid place-items-center shrink-0 ${color}`}>
        <Icon size={18}/>
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className="text-xl font-extrabold">{value}</div>
      </div>
    </div>
  );
}
