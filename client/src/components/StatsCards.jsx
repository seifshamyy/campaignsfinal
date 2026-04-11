import React from "react";
import { Send, CheckCircle, TrendingUp, Calendar } from "lucide-react";

export default function StatsCards({ stats }) {
  const cards = [
    {
      label: "Total Campaigns",
      value: stats?.totalCampaigns ?? "—",
      icon: Calendar,
      style: { color: "var(--brand)", background: "var(--brand-light)" },
    },
    {
      label: "Messages Sent",
      value: stats?.totalMessages?.toLocaleString() ?? "—",
      icon: Send,
      style: { color: "#059669", background: "#ecfdf5" },
    },
    {
      label: "Success Rate",
      value: stats?.successRate !== undefined ? `${stats.successRate}%` : "—",
      icon: TrendingUp,
      style: { color: "var(--accent)", background: "var(--accent-light)" },
    },
    {
      label: "This Month",
      value: stats?.thisMonth ?? "—",
      icon: CheckCircle,
      style: { color: "#d97706", background: "#fffbeb" },
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="card p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {card.label}
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{card.value}</p>
            </div>
            <div className="p-2 rounded-lg" style={{ background: card.style.background }}>
              <card.icon className="w-5 h-5" style={{ color: card.style.color }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
