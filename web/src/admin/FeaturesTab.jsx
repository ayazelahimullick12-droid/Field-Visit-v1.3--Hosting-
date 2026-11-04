import React from "react";
import { LayoutDashboard } from "lucide-react";
import { MANAGEMENT_TABS } from "../lib/features";

/** Admin → Features: what each part of the app shows, and to whom. */
export default function FeaturesTab() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="h-eyebrow">Configuration</p>
          <h1 className="h-title">Features</h1>
          <p className="h-desc">What each part of the app shows, and to whom.</p>
        </div>
      </div>

      <section className="card card-pad">
        <p className="analytics-card-title">Management section</p>
        <p className="analytics-card-sub">Every employee with the Management role sees all of these tabs.</p>
        {MANAGEMENT_TABS.map((t) => (
          <div key={t.key} className="feature-row locked">
            <span className="hub-ico ico-route"><LayoutDashboard size={17} /></span>
            <span className="fr-text"><b>{t.label}</b><small>{t.desc}</small></span>
            <span className="pill pill-ok">Always on</span>
          </div>
        ))}
      </section>
    </div>
  );
}
